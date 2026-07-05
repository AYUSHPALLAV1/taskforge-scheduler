import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { JobStatus, WorkerStatus } from '@prisma/client';
import * as cronParser from 'cron-parser';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private leaderLockToken: string | null = null;
  private readonly lockTtlMs = parseInt(process.env.SCHEDULER_LEADER_LOCK_TTL_MS || '10000');

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ===========================
  // LEADER ELECTION (Redlock-style)
  // ===========================
  private async acquireLeadership(): Promise<boolean> {
    if (this.leaderLockToken) {
      // Try to renew
      const renewed = await this.redis.renewLock('scheduler_leader', this.leaderLockToken, this.lockTtlMs);
      if (renewed) return true;
      this.leaderLockToken = null;
    }

    const token = await this.redis.acquireLock('scheduler_leader', this.lockTtlMs);
    if (token) {
      this.leaderLockToken = token;
      return true;
    }
    return false;
  }

  // ===========================
  // MAIN TICK — every 1 second
  // ===========================
  @Cron('* * * * * *') // every second
  async schedulerTick(): Promise<void> {
    const isLeader = await this.acquireLeadership();
    if (!isLeader) return;

    await Promise.allSettled([
      this.promoteScheduledJobs(),
      this.promoteRecurringJobs(),
      this.reaperScan(),
      this.moveToDlq(),
    ]);
  }

  // ===========================
  // OUTBOX DISPATCHER — every 500ms
  // ===========================
  @Cron('*/1 * * * * *')
  async dispatchOutboxEvents(): Promise<void> {
    const events = await this.prisma.eventOutbox.findMany({
      where: { dispatchedAt: null },
      take: 50,
      orderBy: { createdAt: 'asc' },
    });

    for (const event of events) {
      try {
        // Publish to Redis pub/sub for WebSocket fan-out
        await this.redis.publish(`taskforge:events`, event.payload as any);

        // Route to specific channel based on event type
        const payload = event.payload as any;
        if (payload.projectId) {
          await this.redis.publish(`project:${payload.projectId}`, { event: event.eventType, data: payload });
        }
        if (payload.orgId) {
          await this.redis.publish(`org:${payload.orgId}`, { event: event.eventType, data: payload });
        }

        await this.prisma.eventOutbox.update({
          where: { id: event.id },
          data: { dispatchedAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Failed to dispatch event ${event.id}:`, err.message);
      }
    }
  }

  // ===========================
  // QUEUE STATS ROLLUP — every minute
  // ===========================
  @Cron(CronExpression.EVERY_MINUTE)
  async rollupQueueStats(): Promise<void> {
    const isLeader = await this.acquireLeadership();
    if (!isLeader) return;

    const queues = await this.prisma.queue.findMany({ where: { deletedAt: null } });
    for (const queue of queues) {
      const backlog = await this.prisma.job.count({
        where: { queueId: queue.id, status: { in: [JobStatus.Queued, JobStatus.Claimed] } },
      });

      // Emit backlog size to WebSocket
      await this.prisma.eventOutbox.create({
        data: {
          eventType: 'queue.stats_updated',
          payload: { queueId: queue.id, backlogSize: backlog, timestamp: new Date().toISOString() },
        },
      }).catch(() => {});
    }
  }

  // ===========================
  // PROMOTE SCHEDULED JOBS (run_at <= now)
  // ===========================
  private async promoteScheduledJobs(): Promise<void> {
    const count = await this.prisma.job.updateMany({
      where: {
        status: JobStatus.Scheduled,
        runAt: { lte: new Date() },
        isRecurring: false,
      },
      data: { status: JobStatus.Queued },
    });

    if (count.count > 0) {
      this.logger.debug(`Promoted ${count.count} scheduled jobs → Queued`);
      await this.prisma.$executeRawUnsafe(`NOTIFY job_available, 'scheduler'`).catch(() => {});
    }
  }

  // ===========================
  // PROMOTE RECURRING (CRON) JOBS
  // ===========================
  private async promoteRecurringJobs(): Promise<void> {
    const dueRecurring = await this.prisma.job.findMany({
      where: {
        status: JobStatus.Scheduled,
        isRecurring: true,
        runAt: { lte: new Date() },
      },
    });

    for (const job of dueRecurring) {
      // Promote current instance
      await this.prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.Queued },
      });

      // Schedule next occurrence
      if (job.cronExpression) {
        try {
          const interval = cronParser.parseExpression(job.cronExpression);
          const nextRun = interval.next().toDate();

          await this.prisma.job.create({
            data: {
              queueId: job.queueId,
              projectId: job.projectId,
              type: job.type,
              payload: job.payload as any,
              status: JobStatus.Scheduled,
              priority: job.priority,
              runAt: nextRun,
              cronExpression: job.cronExpression,
              isRecurring: true,
              parentRecurringJobId: job.parentRecurringJobId || job.id,
              maxAttempts: job.maxAttempts,
              retryPolicyId: job.retryPolicyId,
              shardKey: job.shardKey,
            },
          });
        } catch (err) {
          this.logger.error(`Failed to parse cron for job ${job.id}:`, err.message);
        }
      }
    }
  }

  // ===========================
  // HEARTBEAT REAPER (crash recovery)
  // ===========================
  private async reaperScan(): Promise<void> {
    const heartbeatInterval = parseInt(process.env.WORKER_HEARTBEAT_MS || '10000');
    const staleThreshold = new Date(Date.now() - 3 * heartbeatInterval);

    // Find stale workers
    const staleWorkers = await this.prisma.worker.findMany({
      where: {
        status: { in: [WorkerStatus.Online, WorkerStatus.Draining] },
        lastHeartbeatAt: { lt: staleThreshold },
      },
    });

    for (const worker of staleWorkers) {
      this.logger.warn(`⚠️ Stale worker detected: ${worker.id} (${worker.hostname})`);

      // Reset claimed/running jobs back to Queued
      const reset = await this.prisma.job.updateMany({
        where: {
          claimedByWorkerId: worker.id,
          status: { in: [JobStatus.Claimed, JobStatus.Running] },
        },
        data: {
          status: JobStatus.Queued,
          claimedByWorkerId: null,
          runAt: new Date(),
        },
      });

      // Mark worker offline
      await this.prisma.worker.update({
        where: { id: worker.id },
        data: { status: WorkerStatus.Offline },
      });

      if (reset.count > 0) {
        this.logger.log(`Reaper recovered ${reset.count} jobs from stale worker ${worker.id}`);
        await this.prisma.$executeRawUnsafe(`NOTIFY job_available, 'reaper'`).catch(() => {});
      }

      // Emit worker.offline event
      await this.prisma.eventOutbox.create({
        data: {
          eventType: 'worker.offline',
          payload: { workerId: worker.id, hostname: worker.hostname, timestamp: new Date().toISOString() },
        },
      }).catch(() => {});
    }
  }

  // ===========================
  // MOVE FAILED JOBS TO DLQ
  // ===========================
  private async moveToDlq(): Promise<void> {
    const failedJobs = await this.prisma.job.findMany({
      where: { status: JobStatus.Failed },
      include: { retryPolicy: true },
    });

    for (const job of failedJobs) {
      const maxAttempts = job.maxAttempts ?? job.retryPolicy?.maxAttempts ?? 3;
      if (job.attemptCount >= maxAttempts) {
        // Create DLQ snapshot
        await this.prisma.$transaction(async (tx) => {
          await tx.deadLetterJob.create({
            data: {
              originalJobId: job.id,
              queueId: job.queueId,
              jobType: job.type,
              payloadSnapshot: job.payload as any,
              failureReason: job.failureReason || 'Max attempts exceeded',
              attemptCount: job.attemptCount,
            },
          });

          await tx.job.update({
            where: { id: job.id },
            data: { status: JobStatus.DeadLetter },
          });
        });

        await this.prisma.eventOutbox.create({
          data: {
            eventType: 'job.dead_lettered',
            payload: {
              jobId: job.id,
              failureReason: job.failureReason,
              attemptCount: job.attemptCount,
              timestamp: new Date().toISOString(),
            },
          },
        }).catch(() => {});

        this.logger.warn(`Job ${job.id} moved to DLQ after ${job.attemptCount} attempts`);
      }
    }
  }

  // ===========================
  // HEARTBEAT DATA RETENTION
  // ===========================
  @Cron(CronExpression.EVERY_HOUR)
  async cleanOldHeartbeats(): Promise<void> {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000); // 48 hours
    await this.prisma.workerHeartbeat.deleteMany({ where: { timestamp: { lt: cutoff } } });

    // Also clean dispatched outbox events
    const outboxCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.prisma.eventOutbox.deleteMany({ where: { dispatchedAt: { lt: outboxCutoff } } });
  }

  // ===========================
  // WORKFLOW ORCHESTRATION
  // ===========================
  async orchestrateWorkflowStep(workflowRunId: string, nodeKey: string, outcome: 'Completed' | 'Failed'): Promise<void> {
    const lockKey = `workflow_run:${workflowRunId}`;
    const token = await this.redis.acquireLock(lockKey, 5000);
    if (!token) {
      this.logger.warn(`Could not acquire workflow lock for run ${workflowRunId}`);
      return;
    }

    try {
      const run = await this.prisma.workflowRun.findUnique({
        where: { id: workflowRunId },
        include: { jobs: true, workflow: { include: { deps: true, nodes: true } } },
      });
      if (!run) return;

      const condition = outcome === 'Completed' ? 'OnSuccess' : 'OnFailure';

      // Find downstream nodes whose condition matches
      const eligibleDeps = run.workflow.deps.filter(
        (d) => d.upstreamNodeKey === nodeKey && (d.condition === condition || d.condition === 'Always'),
      );

      for (const dep of eligibleDeps) {
        // Check if all upstream deps of the downstream node are satisfied
        const allUpstreams = run.workflow.deps.filter((d) => d.downstreamNodeKey === dep.downstreamNodeKey);
        const allSatisfied = allUpstreams.every((upDep) => {
          const upJob = run.jobs.find((j) => j.nodeKey === upDep.upstreamNodeKey);
          return upJob && ['Completed', 'Failed'].includes(upJob.status);
        });

        if (!allSatisfied) continue; // Fan-in: wait for all upstreams

        // Don't create if already exists
        const existing = run.jobs.find((j) => j.nodeKey === dep.downstreamNodeKey);
        if (existing) continue;

        // Find node template
        const node = run.workflow.nodes.find((n) => n.nodeKey === dep.downstreamNodeKey);
        if (!node) continue;

        const template = node.jobTemplate as any;
        const queue = await this.prisma.queue.findFirst({ where: { projectId: run.workflow.projectId } });
        if (!queue) continue;

        // Create downstream job
        const job = await this.prisma.job.create({
          data: {
            queueId: queue.id,
            projectId: run.workflow.projectId,
            type: template.type || 'generic',
            payload: template.payload || {},
            status: JobStatus.Queued,
            priority: template.priority || 5,
            shardKey: 0,
          },
        });

        await this.prisma.workflowRunJob.create({
          data: {
            workflowRunId,
            nodeKey: dep.downstreamNodeKey,
            workflowJobId: node.id,
            jobId: job.id,
            status: JobStatus.Queued,
          },
        });
      }

      // Check if workflow run is complete
      const allNodes = run.workflow.nodes;
      const allRunJobs = await this.prisma.workflowRunJob.findMany({ where: { workflowRunId } });
      const terminalStatuses = ['Completed', 'Failed', 'Cancelled', 'DeadLetter'];
      const allComplete = allNodes.every((node) => {
        const rj = allRunJobs.find((j) => j.nodeKey === node.nodeKey);
        return rj && terminalStatuses.includes(rj.status);
      });

      if (allComplete) {
        const hasFailed = allRunJobs.some((j) => j.status === 'Failed' || j.status === 'DeadLetter');
        await this.prisma.workflowRun.update({
          where: { id: workflowRunId },
          data: {
            status: hasFailed ? 'Failed' : 'Completed',
            completedAt: new Date(),
          },
        });
      }
    } finally {
      await this.redis.releaseLock(lockKey, token);
    }
  }
}
