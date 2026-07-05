import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, Logger, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateJobDto, ListJobsDto, BatchCreateJobDto } from './dto/job.dto';
import { JobStatus } from '../common/enums';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ===========================
  // CREATE JOB (single)
  // ===========================
  async createJob(dto: CreateJobDto, projectId: string, userId?: string) {
    const queue = await this.prisma.queue.findFirst({
      where: { id: dto.queueId, projectId, deletedAt: null },
    });
    if (!queue) throw new NotFoundException('Queue not found');

    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.prisma.job.findFirst({
        where: { idempotencyKey: dto.idempotencyKey, projectId },
      });
      if (existing) return existing; // Return existing job — idempotent
    }

    // Max queue size check
    if (queue.maxQueueSize) {
      const count = await this.prisma.job.count({
        where: { queueId: queue.id, status: { in: [JobStatus.Queued, JobStatus.Claimed] } },
      });
      if (count >= queue.maxQueueSize) {
        throw new BadRequestException('Queue is at maximum capacity');
      }
    }

    const isScheduled = dto.runAt && new Date(dto.runAt) > new Date();
    const isRecurring = !!dto.cronExpression;
    const shardKey = Math.abs(parseInt(uuidv4().replace(/-/g, '').slice(0, 8), 16)) % (queue.shardCount || 1);

    const job = await this.prisma.job.create({
      data: {
        queueId: dto.queueId,
        projectId,
        type: dto.type,
        payload: dto.payload || {},
        status: isScheduled ? JobStatus.Scheduled : JobStatus.Queued,
        priority: dto.priority ?? 5,
        runAt: dto.runAt ? new Date(dto.runAt) : new Date(),
        cronExpression: dto.cronExpression,
        isRecurring,
        maxAttempts: dto.maxAttempts,
        retryPolicyId: dto.retryPolicyId || queue.retryPolicyId,
        idempotencyKey: dto.idempotencyKey,
        createdById: userId,
        shardKey,
      },
    });

    // Notify workers via Postgres LISTEN/NOTIFY (event-driven wake-up)
    if (!isScheduled) {
      await this.prisma.$executeRawUnsafe(`NOTIFY job_available, '${queue.id}'`).catch(() => {});
    }

    // Outbox event for WebSocket fan-out
    await this.prisma.eventOutbox.create({
      data: {
        eventType: 'job.created',
        payload: { jobId: job.id, queueId: job.queueId, projectId, status: job.status, timestamp: new Date().toISOString() },
      },
    }).catch(() => {});

    this.logger.log(`Job created: ${job.id} (type=${job.type}, status=${job.status})`);
    return job;
  }

  // ===========================
  // BATCH CREATE
  // ===========================
  async batchCreate(dto: BatchCreateJobDto, projectId: string, userId?: string) {
    const batchId = uuidv4();
    const jobs = await this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const jobDto of dto.jobs) {
        const queue = await tx.queue.findFirst({ where: { id: jobDto.queueId, projectId } });
        if (!queue) continue;

        const job = await tx.job.create({
          data: {
            queueId: jobDto.queueId,
            projectId,
            type: jobDto.type,
            payload: jobDto.payload || {},
            status: jobDto.runAt && new Date(jobDto.runAt) > new Date() ? JobStatus.Scheduled : JobStatus.Queued,
            priority: jobDto.priority ?? 5,
            runAt: jobDto.runAt ? new Date(jobDto.runAt) : new Date(),
            cronExpression: jobDto.cronExpression,
            isRecurring: !!jobDto.cronExpression,
            maxAttempts: jobDto.maxAttempts,
            retryPolicyId: jobDto.retryPolicyId || queue.retryPolicyId,
            idempotencyKey: jobDto.idempotencyKey,
            createdById: userId,
            batchId,
            shardKey: 0,
          },
        });
        results.push(job);
      }
      return results;
    });

    await this.prisma.$executeRawUnsafe(`NOTIFY job_available, 'batch'`).catch(() => {});
    return { batchId, count: jobs.length, jobs };
  }

  // ===========================
  // LIST JOBS (cursor pagination)
  // ===========================
  async listJobs(projectId: string, dto: ListJobsDto) {
    const limit = dto.limit || 50;
    const where: any = { projectId };

    if (dto.status) where.status = dto.status as JobStatus;
    if (dto.queueId) where.queueId = dto.queueId;
    if (dto.type) where.type = dto.type;
    if (dto.from || dto.to) {
      where.createdAt = {};
      if (dto.from) where.createdAt.gte = new Date(dto.from);
      if (dto.to) where.createdAt.lte = new Date(dto.to);
    }

    // Cursor-based pagination
    if (dto.cursor) {
      where.createdAt = { ...(where.createdAt as any), lt: new Date(Buffer.from(dto.cursor, 'base64').toString()) };
    }

    const jobs = await this.prisma.job.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1, // fetch one extra to know if hasMore
    });

    const hasMore = jobs.length > limit;
    const data = hasMore ? jobs.slice(0, limit) : jobs;
    const nextCursor = hasMore
      ? Buffer.from(data[data.length - 1].createdAt.toISOString()).toString('base64')
      : undefined;

    return { data, meta: { hasMore, cursor: nextCursor } };
  }

  // ===========================
  // GET JOB
  // ===========================
  async getJob(id: string, projectId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id, projectId },
      include: { executions: { orderBy: { attemptNumber: 'desc' } }, aiSummary: true },
    });
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  // ===========================
  // CANCEL JOB
  // ===========================
  async cancelJob(id: string, projectId: string) {
    const job = await this.prisma.job.findFirst({ where: { id, projectId } });
    if (!job) throw new NotFoundException('Job not found');

    if (!['Queued', 'Scheduled', 'Claimed'].includes(job.status)) {
      throw new BadRequestException(`Cannot cancel job in status: ${job.status}`);
    }

    const updated = await this.prisma.job.update({
      where: { id },
      data: { status: JobStatus.Cancelled },
    });

    await this.prisma.eventOutbox.create({
      data: {
        eventType: 'job.cancelled',
        payload: { jobId: id, projectId, timestamp: new Date().toISOString() },
      },
    }).catch(() => {});

    return updated;
  }

  // ===========================
  // RETRY JOB
  // ===========================
  async retryJob(id: string, projectId: string) {
    const job = await this.prisma.job.findFirst({ where: { id, projectId } });
    if (!job) throw new NotFoundException('Job not found');

    if (!['Failed', 'Cancelled', 'DeadLetter'].includes(job.status)) {
      throw new BadRequestException(`Cannot retry job in status: ${job.status}`);
    }

    const updated = await this.prisma.job.update({
      where: { id },
      data: {
        status: JobStatus.Queued,
        attemptCount: 0,
        runAt: new Date(),
        claimedByWorkerId: null,
        failureReason: null,
      },
    });

    await this.prisma.$executeRawUnsafe(`NOTIFY job_available, '${job.queueId}'`).catch(() => {});
    return updated;
  }

  // ===========================
  // GET EXECUTIONS
  // ===========================
  async getExecutions(jobId: string, projectId: string) {
    const job = await this.prisma.job.findFirst({ where: { id: jobId, projectId } });
    if (!job) throw new NotFoundException('Job not found');

    return this.prisma.jobExecution.findMany({
      where: { jobId },
      orderBy: { attemptNumber: 'desc' },
    });
  }

  // ===========================
  // GET EXECUTION LOGS (cursor paginated)
  // ===========================
  async getExecutionLogs(executionId: string, cursor?: string, limit = 100) {
    const where: any = { jobExecutionId: executionId };
    if (cursor) {
      where.timestamp = { gt: new Date(Buffer.from(cursor, 'base64').toString()) };
    }

    const logs = await this.prisma.jobLog.findMany({
      where,
      orderBy: { timestamp: 'asc' },
      take: limit + 1,
    });

    const hasMore = logs.length > limit;
    const data = hasMore ? logs.slice(0, limit) : logs;
    const nextCursor = hasMore
      ? Buffer.from(data[data.length - 1].timestamp.toISOString()).toString('base64')
      : undefined;

    return { data, meta: { hasMore, cursor: nextCursor } };
  }
}
