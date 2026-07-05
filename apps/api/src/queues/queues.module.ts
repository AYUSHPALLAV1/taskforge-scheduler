import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';

class CreateQueueDto {
  @IsString() name: string;
  @IsString() slug: string;
  @IsOptional() @IsInt() @Min(1) priority?: number;
  @IsOptional() @IsInt() concurrencyLimit?: number;
  @IsOptional() @IsInt() maxQueueSize?: number;
  @IsOptional() @IsInt() shardCount?: number;
  @IsOptional() @IsString() retryPolicyId?: string;
}

@ApiTags('queues')
@Controller('projects/:projectId/queues')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QueuesController {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService) {}

  @Get()
  @ApiOperation({ summary: 'List queues in a project' })
  async listQueues(@Param('projectId') projectId: string) {
    return this.prisma.queue.findMany({ where: { projectId, deletedAt: null } });
  }

  @Post()
  @ApiOperation({ summary: 'Create a queue' })
  async createQueue(@Param('projectId') projectId: string, @Body() dto: CreateQueueDto) {
    return this.prisma.queue.create({
      data: {
        projectId, name: dto.name, slug: dto.slug,
        priority: dto.priority ?? 5,
        concurrencyLimit: dto.concurrencyLimit ?? 10,
        maxQueueSize: dto.maxQueueSize,
        shardCount: dto.shardCount ?? 1,
        retryPolicyId: dto.retryPolicyId,
      },
    });
  }

  @Get(':queueId')
  @ApiOperation({ summary: 'Get queue details' })
  async getQueue(@Param('queueId') queueId: string) {
    return this.prisma.queue.findUniqueOrThrow({ where: { id: queueId }, include: { retryPolicy: true } });
  }

  @Patch(':queueId')
  @ApiOperation({ summary: 'Update queue configuration (If-Match optimistic concurrency)' })
  async updateQueue(@Param('queueId') queueId: string, @Body() dto: Partial<CreateQueueDto & { isPaused: boolean }>, @Req() req: any) {
    const current = await this.prisma.queue.findUniqueOrThrow({ where: { id: queueId } });
    const ifMatch = req.headers['if-match'];
    if (ifMatch && parseInt(ifMatch) !== current.version) {
      throw Object.assign(new Error('Version conflict'), { status: 409 });
    }
    return this.prisma.queue.update({ where: { id: queueId }, data: { ...dto, version: { increment: 1 } } });
  }

  @Post(':queueId/pause')
  @ApiOperation({ summary: 'Pause a queue' })
  async pauseQueue(@Param('queueId') queueId: string) {
    return this.prisma.queue.update({ where: { id: queueId }, data: { isPaused: true } });
  }

  @Post(':queueId/resume')
  @ApiOperation({ summary: 'Resume a paused queue' })
  async resumeQueue(@Param('queueId') queueId: string) {
    const q = await this.prisma.queue.update({ where: { id: queueId }, data: { isPaused: false } });
    await this.prisma.$executeRawUnsafe(`NOTIFY job_available, '${queueId}'`).catch(() => {});
    return q;
  }

  @Get(':queueId/stats')
  @ApiOperation({ summary: 'Get queue statistics' })
  async getQueueStats(@Param('queueId') queueId: string) {
    const [stats, backlog] = await Promise.all([
      this.prisma.queueStat.findMany({ where: { queueId }, orderBy: { date: 'desc' }, take: 30 }),
      this.prisma.job.count({ where: { queueId, status: { in: ['Queued', 'Claimed', 'Running'] as any } } }),
    ]);
    return { stats, backlog };
  }

  @Delete(':queueId')
  @ApiOperation({ summary: 'Soft-delete a queue' })
  async deleteQueue(@Param('queueId') queueId: string) {
    return this.prisma.queue.update({ where: { id: queueId }, data: { deletedAt: new Date() } });
  }
}

@ApiTags('queues')
@Controller('queues')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QueuesDirectController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(':queueId/pause')
  async pause(@Param('queueId') queueId: string) {
    return this.prisma.queue.update({ where: { id: queueId }, data: { isPaused: true } });
  }

  @Post(':queueId/resume')
  async resume(@Param('queueId') queueId: string) {
    const q = await this.prisma.queue.update({ where: { id: queueId }, data: { isPaused: false } });
    await this.prisma.$executeRawUnsafe(`NOTIFY job_available, '${queueId}'`).catch(() => {});
    return q;
  }
}

@Module({ controllers: [QueuesController, QueuesDirectController] })
export class QueuesModule {}
