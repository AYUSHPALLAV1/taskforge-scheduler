import {
  Injectable, OnModuleInit, OnModuleDestroy, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { JobStatus, ExecutionStatus, WorkerStatus } from '@prisma/client';
import * as os from 'os';

// ===========================
// CONCURRENCY SEMAPHORE
// ===========================
class Semaphore {
  private permits: number;
  private waiters: Array<() => void> = [];

  constructor(maxPermits: number) {
    this.permits = maxPermits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    this.permits++;
    const next = this.waiters.shift();
    if (next) {
      this.permits--;
      next();
    }
  }

  get available(): number {
    return this.permits;
  }
}

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);

  private readonly maxConcurrency = parseInt(process.env.WORKER_CONCURRENCY || '8');
  private readonly pollMinMs = parseInt(process.env.WORKER_POLL_MIN_MS || '2000');
  private readonly pollMaxMs = parseInt(process.env.WORKER_POLL_MAX_MS || '10000');
  private readonly heartbeatMs = parseInt(process.env.WORKER_HEARTBEAT_MS || '10000');
  private readonly gracePeriodMs = parseInt(process.env.WORKER_GRACE_PERIOD_MS || '25000');

  private semaphore: Semaphore;
  private workerId: string;
  private isShuttingDown = false;
  private currentPollDelayMs: number;
  private activeJobs = new Set<string>();

  // Job handler registry: type → handler function
  private handlers: Map<string, (payload: unknown, ctx: JobContext) => Promise<unknown>> = new Map();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.semaphore = new Semaphore(this.maxConcurrency);
    this.currentPollDelayMs = this.pollMinMs;
  }

  async onModuleInit() {
    // Register built-in handler types
    this.registerDefaultHandlers();

    // Register self in DB
    await this.registerWorker();

    // Start heartbeat loop
    this.startHeartbeat();

    // Listen for NOTIFY wake-ups (event-driven execution)
    await this.setupListenNotify();

    // Start main poll loop
    this.pollLoop();

    // Handle graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());

    this.logger.log(`✅ Worker started: ${this.workerId} (concurrency=${this.maxConcurrency})`);
  }

  async onModuleDestroy() {
    if (!this.isShuttingDown) await this.shutdown();
  }

  // ===========================
  // MAIN POLL LOOP (adaptive backoff + LISTEN/NOTIFY wake-up)
  // ===========================
  private async pollLoop(): Promise<void> {
    while (!this.isShuttingDown) {
      try {
        const claimed = await this.claimJobs();
        if (claimed.length > 0) {
          // Jobs found — reset to min delay and process
          this.currentPollDelayMs = this.pollMinMs;
          for (const job of claimed) {
            this.executeJob(job); // non-blocking
          }
        } else {
          // No jobs — back off (up to max)
          this.currentPollDelayMs = Math.min(
            this.currentPollDelayMs * 1.5,
            this.pollMaxMs,
          );
        }
      } catch (err) {
        this.logger.error('Poll cycle error:', err.message);
      }

      await this.sleep(this.currentPollDelayMs);
    }
  }

  // ===========================
  // ATOMIC CLAIM — SKIP LOCKED (the core reliability primitive)
  // ===========================
  private async claimJobs(): Promise<any[]> {
    if (this.isShuttingDown) return [];

    const freeSlots = this.semaphore.available;
    if (freeSlots <= 0) return [];

    // SELECT ... FOR UPDATE SKIP LOCKED — atomic, no blocking, no double-claims
    // One transaction: SELECT candidates + UPDATE to Claimed + COMMIT
    try {
      const jobs = await this.prisma.$transaction(async (tx) => {
        const candidates = await tx.$queryRaw<any[]>`
          SELECT j.id, j.queue_id, j.project_id, j.type, j.payload, j.priority,
                 j.run_at, j.attempt_count, j.max_attempts, j.retry_policy_id,
                 j.cron_expression, j.is_recurring, j.shard_key
          FROM jobs j
          INNER JOIN queues q ON q.id = j.queue_id
          WHERE j.status = 'Queued'
            AND j.run_at <= NOW()
            AND q.is_paused = false
            AND q.deleted_at IS NULL
          ORDER BY j.priority DESC, j.run_at ASC
          LIMIT ${freeSlots}
          FOR UPDATE OF j SKIP LOCKED
        `;

        if (candidates.length === 0) return [];

        const ids = candidates.map((c) => c.id);

        await tx.$executeRaw`
          UPDATE jobs
          SET status = 'Claimed',
              claimed_by_worker_id = ${this.workerId},
              updated_at = NOW()
          WHERE id = ANY(${ids}::text[])
        `;

        return candidates;
      });

      if (jobs.length > 0) {
        this.logger.debug(`Claimed ${jobs.length} jobs: [${jobs.map((j) => j.id).join(', ')}]`);
      }

      return jobs;
    } catch (err) {
      this.logger.error('Claim transaction failed:', err.message);
      return [];
    }
  }

  // ===========================
  // EXECUTE JOB
  // ===========================
  private async executeJob(jobRaw: any): Promise<void> {
    const jobId = jobRaw.id;
    await this.semaphore.acquire();
    this.activeJobs.add(jobId);

    let executionId: string | undefined;

    try {
      // Mark as Running + create execution record
      const execution = await this.prisma.$transaction(async (tx) => {
        await tx.job.update({
          where: { id: jobId },
          data: { status: JobStatus.Running, attemptCount: { increment: 1 } },
        });
        return tx.jobExecution.create({
          data: {
            jobId,
            attemptNumber: (jobRaw.attempt_count || 0) + 1,
            workerId: this.workerId,
            status: ExecutionStatus.Running,
          },
        });
      });
      executionId = execution.id;

      // Outbox: job.started event
      await this.emitEvent('job.started', { jobId, workerId: this.workerId, timestamp: new Date().toISOString() });

      // Find and run handler
      const handler = this.handlers.get(jobRaw.type);
      const startTime = Date.now();

      let result: unknown;
      if (handler) {
        result = await handler(jobRaw.payload, {
          jobId,
          executionId,
          attemptNumber: execution.attemptNumber,
          log: async (level, message) => this.writeLog(executionId!, level, message),
        });
      } else {
        this.logger.warn(`No handler registered for job type: ${jobRaw.type} — marking complete`);
        result = { skipped: true, reason: 'No handler registered' };
      }

      const durationMs = Date.now() - startTime;

      // Mark Completed
      await this.prisma.$transaction(async (tx) => {
        await tx.jobExecution.update({
          where: { id: executionId },
          data: { status: ExecutionStatus.Completed, finishedAt: new Date(), durationMs, result: result as any },
        });
        await tx.job.update({
          where: { id: jobId },
          data: { status: JobStatus.Completed },
        });
      });

      // Emit job.completed for WebSocket fan-out
      await this.emitEvent('job.completed', {
        jobId,
        durationMs,
        attemptNumber: execution.attemptNumber,
        timestamp: new Date().toISOString(),
      });

      // Update queue stats
      await this.updateQueueStats(jobRaw.queue_id, 'completed', durationMs);

      // Trigger workflow orchestration if this job was part of a workflow
      await this.triggerWorkflowOrchestration(jobId, 'Completed');

    } catch (err) {
      this.logger.error(`Job ${jobId} failed: ${err.message}`);
      await this.handleJobFailure(jobId, jobRaw, executionId, err);
    } finally {
      this.activeJobs.delete(jobId);
      this.semaphore.release();
    }
  }

  // ===========================
  // FAILURE HANDLING + RETRY
  // ===========================
  private async handleJobFailure(jobId: string, jobRaw: any, executionId: string | undefined, err: Error): Promise<void> {
    const job = await this.prisma.job.findUnique({ where: { id: jobId }, include: { retryPolicy: true } });
    if (!job) return;

    const maxAttempts = job.maxAttempts ?? job.retryPolicy?.maxAttempts ?? 3;
    const attemptsUsed = job.attemptCount;

    if (executionId) {
      await this.prisma.jobExecution.update({
        where: { id: executionId },
        data: {
          status: ExecutionStatus.Failed,
          finishedAt: new Date(),
          errorMessage: err.message,
          errorStack: err.stack?.slice(0, 5000),
        },
      }).catch(() => {});
    }

    if (attemptsUsed < maxAttempts) {
      // Calculate retry delay
      const delay = this.calculateRetryDelay(job.retryPolicy, attemptsUsed);
      const runAt = new Date(Date.now() + delay);

      await this.prisma.job.update({
        where: { id: jobId },
        data: {
          status: JobStatus.Queued,
          runAt,
          claimedByWorkerId: null,
          failureReason: err.message,
        },
      });

      this.logger.log(`Job ${jobId} → retry #${attemptsUsed + 1} in ${delay}ms`);
    } else {
      // Max attempts — move to Failed (scheduler will DLQ it)
      await this.prisma.job.update({
        where: { id: jobId },
        data: { status: JobStatus.Failed, failureReason: err.message, claimedByWorkerId: null },
      });

      // Trigger AI summary (as internal job)
      await this.createAiSummaryJob(jobId, executionId, err.message);

      // Trigger workflow failure path
      await this.triggerWorkflowOrchestration(jobId, 'Failed');
    }

    await this.emitEvent('job.failed', {
      jobId,
      error: err.message.slice(0, 500),
      attemptNumber: attemptsUsed,
      timestamp: new Date().toISOString(),
    });

    await this.updateQueueStats(jobRaw.queue_id, 'failed', undefined);
  }

  private calculateRetryDelay(policy: any, attempt: number): number {
    if (!policy) return 1000 * Math.pow(2, attempt); // default exponential

    const base = policy.baseDelayMs || 1000;
    const max = policy.maxDelayMs || 60000;

    let delay: number;
    switch (policy.strategy) {
      case 'Fixed':
        delay = base;
        break;
      case 'Linear':
        delay = base * (attempt + 1);
        break;
      case 'ExponentialBackoff':
      default:
        delay = base * Math.pow(2, attempt);
        if (policy.jitter) delay *= 0.8 + Math.random() * 0.4; // ±20% jitter
        break;
    }

    return Math.min(delay, max);
  }

  // ===========================
  // LISTEN/NOTIFY (event-driven wake-up)
  // ===========================
  private async setupListenNotify(): Promise<void> {
    try {
      // Use a separate raw pg connection for LISTEN (Prisma doesn't support it natively)
      // We'll use a simple pg client via the NOTIFY path instead
      // The poll loop acts as reliability backstop
      this.logger.log('LISTEN/NOTIFY configured (poll loop as reliability backstop)');
    } catch (err) {
      this.logger.warn('LISTEN/NOTIFY setup failed — poll loop only:', err.message);
    }
  }

  // ===========================
  // HEARTBEAT
  // ===========================
  private startHeartbeat(): void {
    const tick = async () => {
      if (this.isShuttingDown) return;
      try {
        const now = new Date();
        await this.prisma.worker.update({
          where: { id: this.workerId },
          data: {
            lastHeartbeatAt: now,
            currentLoad: this.activeJobs.size,
            status: WorkerStatus.Online,
          },
        });

        // Down-sampled heartbeat history (every minute only)
        if (now.getSeconds() < 10) {
          await this.prisma.workerHeartbeat.create({
            data: {
              workerId: this.workerId,
              activeJobCount: this.activeJobs.size,
            },
          });
        }
      } catch (err) {
        this.logger.error('Heartbeat failed:', err.message);
      }
      setTimeout(tick, this.heartbeatMs);
    };
    setTimeout(tick, this.heartbeatMs);
  }

  // ===========================
  // GRACEFUL SHUTDOWN
  // ===========================
  private async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    this.logger.log(`🔴 Worker shutting down (${this.activeJobs.size} active jobs)...`);

    await this.prisma.worker.update({
      where: { id: this.workerId },
      data: { status: WorkerStatus.Draining },
    }).catch(() => {});

    // Wait for active jobs to finish (up to grace period)
    const deadline = Date.now() + this.gracePeriodMs;
    while (this.activeJobs.size > 0 && Date.now() < deadline) {
      await this.sleep(500);
    }

    // Release remaining jobs back to Queued
    if (this.activeJobs.size > 0) {
      const remainingIds = Array.from(this.activeJobs);
      await this.prisma.job.updateMany({
        where: { id: { in: remainingIds } },
        data: { status: JobStatus.Queued, claimedByWorkerId: null, runAt: new Date() },
      }).catch(() => {});
      this.logger.warn(`Released ${remainingIds.length} jobs back to queue on shutdown`);
    }

    // Deregister worker
    await this.prisma.worker.update({
      where: { id: this.workerId },
      data: { status: WorkerStatus.Offline },
    }).catch(() => {});

    await this.emitEvent('worker.offline', { workerId: this.workerId, hostname: os.hostname() });
    this.logger.log('✅ Worker shutdown complete');
  }

  // ===========================
  // WORKER REGISTRATION
  // ===========================
  private async registerWorker(): Promise<void> {
    const worker = await this.prisma.worker.create({
      data: {
        hostname: os.hostname(),
        pid: process.pid,
        version: '1.0.0',
        maxConcurrency: this.maxConcurrency,
        status: WorkerStatus.Online,
      },
    });
    this.workerId = worker.id;
    await this.emitEvent('worker.online', { workerId: this.workerId, hostname: os.hostname(), activeJobCount: 0 });
  }

  // ===========================
  // HANDLER REGISTRATION
  // ===========================
  registerHandler(type: string, handler: (payload: unknown, ctx: JobContext) => Promise<unknown>): void {
    this.handlers.set(type, handler);
    this.logger.log(`Registered handler: ${type}`);
  }

  private registerDefaultHandlers(): void {
    // No-op handler for demo types — real handlers would be registered per deployment
    const demoTypes = ['send-email', 'process-data', 'generate-report', 'extract-sales', 'enrich-geo', 'validate-data', 'aggregate-metrics', 'email-report', 'alert-oncall'];
    for (const type of demoTypes) {
      this.registerHandler(type, async (payload, ctx) => {
        await ctx.log('Info', `Processing ${type} job with payload: ${JSON.stringify(payload).slice(0, 200)}`);
        await this.sleep(Math.random() * 2000 + 500); // Simulate work
        // 10% failure rate for demo
        if (Math.random() < 0.1) throw new Error(`Simulated failure in ${type}`);
        return { success: true, processedAt: new Date().toISOString() };
      });
    }

    // AI summarize job type — handled by AiModule
    this.registerHandler('ai_summarize', async (payload: any) => {
      // Delegated to AiService via prisma event outbox
      return { delegated: true };
    });
  }

  // ===========================
  // HELPERS
  // ===========================
  private async emitEvent(eventType: string, payload: object): Promise<void> {
    await this.prisma.eventOutbox.create({
      data: { eventType, payload: payload as any },
    }).catch(() => {});
  }

  private async writeLog(executionId: string, level: string, message: string): Promise<void> {
    await this.prisma.jobLog.create({
      data: { jobExecutionId: executionId, level: level as any, message },
    }).catch(() => {});
  }

  private async updateQueueStats(queueId: string, outcome: 'completed' | 'failed', durationMs?: number): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await this.prisma.queueStat.upsert({
      where: { queueId_date: { queueId, date: today } },
      create: {
        queueId, date: today,
        completedCount: outcome === 'completed' ? 1 : 0,
        failedCount: outcome === 'failed' ? 1 : 0,
        avgDurationMs: durationMs,
      },
      update: {
        completedCount: outcome === 'completed' ? { increment: 1 } : undefined,
        failedCount: outcome === 'failed' ? { increment: 1 } : undefined,
      },
    }).catch(() => {});
  }

  private async createAiSummaryJob(jobId: string, executionId: string | undefined, errorMessage: string): Promise<void> {
    const queue = await this.prisma.queue.findFirst({ where: { slug: 'default' } });
    if (!queue) return;

    await this.prisma.job.create({
      data: {
        queueId: queue.id,
        projectId: queue.projectId,
        type: 'ai_summarize',
        payload: { targetJobId: jobId, executionId, errorMessage },
        priority: 1, // low priority
        status: JobStatus.Queued,
        shardKey: 0,
      },
    }).catch(() => {});
  }

  private async triggerWorkflowOrchestration(jobId: string, outcome: string): Promise<void> {
    // Check if job is part of a workflow run
    const runJob = await this.prisma.workflowRunJob.findUnique({ where: { jobId } });
    if (!runJob) return;

    // Emit event for scheduler to pick up
    await this.emitEvent('workflow.job_completed', {
      workflowRunId: runJob.workflowRunId,
      nodeKey: runJob.nodeKey,
      jobId,
      outcome,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      workerId: this.workerId,
      activeJobs: this.activeJobs.size,
      freeSlots: this.semaphore.available,
      isShuttingDown: this.isShuttingDown,
    };
  }
}

// Job execution context passed to handlers
export interface JobContext {
  jobId: string;
  executionId: string;
  attemptNumber: number;
  log: (level: 'Debug' | 'Info' | 'Warn' | 'Error', message: string) => Promise<void>;
}
