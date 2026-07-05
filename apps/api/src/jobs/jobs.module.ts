import { Module } from '@nestjs/common';
import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Req, Headers } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiHeader } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JobsService } from './jobs.service';
import { CreateJobDto, BatchCreateJobDto, ListJobsDto } from './dto/job.dto';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('jobs')
@Controller('jobs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a job (immediate, delayed, scheduled, or recurring)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Deduplication key' })
  async createJob(
    @Body() dto: CreateJobDto,
    @Req() req: any,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const queue = await this.prisma.queue.findUnique({ where: { id: dto.queueId } });
    if (!queue) return { error: { code: 'NOT_FOUND', message: 'Queue not found' } };

    if (idempotencyKey && !dto.idempotencyKey) {
      dto.idempotencyKey = idempotencyKey;
    }

    return this.jobsService.createJob(dto, queue.projectId, req.user?.id);
  }

  @Post('batch')
  @ApiOperation({ summary: 'Create multiple jobs in one transaction' })
  async batchCreate(@Body() dto: BatchCreateJobDto, @Req() req: any) {
    if (!dto.jobs.length) return { batchId: null, count: 0, jobs: [] };
    const queue = await this.prisma.queue.findUnique({ where: { id: dto.jobs[0].queueId } });
    if (!queue) return { error: { code: 'NOT_FOUND', message: 'Queue not found' } };
    return this.jobsService.batchCreate(dto, queue.projectId, req.user?.id);
  }

  @Get()
  @ApiOperation({ summary: 'List jobs with cursor-based pagination and filters' })
  async listJobs(@Query() query: ListJobsDto, @Req() req: any) {
    // Get projectId from query or default to first project
    const projectId = query.queueId
      ? (await this.prisma.queue.findUnique({ where: { id: query.queueId } }))?.projectId || ''
      : '';
    if (!projectId && !query.queueId) {
      return { data: [], meta: { hasMore: false } };
    }
    return this.jobsService.listJobs(projectId, query);
  }

  @Get('batch/:batchId')
  @ApiOperation({ summary: 'Get all jobs in a batch' })
  async getBatch(@Param('batchId') batchId: string) {
    const jobs = await this.prisma.job.findMany({ where: { batchId } });
    const completed = jobs.filter((j) => j.status === 'Completed').length;
    return { batchId, total: jobs.length, completed, failed: jobs.filter((j) => j.status === 'Failed').length, jobs };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific job' })
  async getJob(@Param('id') id: string, @Req() req: any) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: { executions: { orderBy: { attemptNumber: 'desc' } }, aiSummary: true, queue: true },
    });
    return job;
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a queued/scheduled/claimed job' })
  async cancelJob(@Param('id') id: string, @Req() req: any) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) return { error: { code: 'NOT_FOUND', message: 'Job not found' } };
    return this.jobsService.cancelJob(id, job.projectId);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed/cancelled job' })
  async retryJob(@Param('id') id: string, @Req() req: any) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) return { error: { code: 'NOT_FOUND', message: 'Job not found' } };
    return this.jobsService.retryJob(id, job.projectId);
  }

  @Get(':id/executions')
  @ApiOperation({ summary: 'Get execution history for a job' })
  async getExecutions(@Param('id') id: string, @Req() req: any) {
    const job = await this.prisma.job.findUnique({ where: { id } });
    if (!job) return [];
    return this.jobsService.getExecutions(id, job.projectId);
  }

  @Get('executions/:executionId/logs')
  @ApiOperation({ summary: 'Get execution logs (cursor-paginated)' })
  async getExecutionLogs(
    @Param('executionId') executionId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.jobsService.getExecutionLogs(executionId, cursor, limit ? parseInt(limit) : 100);
  }
}

@Module({
  providers: [JobsService],
  controllers: [JobsController],
  exports: [JobsService],
})
export class JobsModule {}
