import { Module } from '@nestjs/common';
import { Controller, Get, Post, Body, Param, UseGuards, Req, Query, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsArray, IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulerService } from '../scheduler/scheduler.service';
import { DependencyCondition, JobStatus } from '../common/enums';

class WorkflowNodeDto {
  @IsString() nodeKey: string;
  jobTemplate: Record<string, unknown>;
}
class WorkflowEdgeDto {
  @IsString() upstreamNodeKey: string;
  @IsString() downstreamNodeKey: string;
  @IsEnum(DependencyCondition) condition: DependencyCondition;
}
class CreateWorkflowDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowNodeDto) nodes: WorkflowNodeDto[];
  @IsArray() @ValidateNested({ each: true }) @Type(() => WorkflowEdgeDto) edges: WorkflowEdgeDto[];
}

@ApiTags('workflows')
@Controller('projects/:projectId/workflows')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
class WorkflowsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scheduler: SchedulerService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List workflows in a project' })
  async listWorkflows(@Param('projectId') projectId: string) {
    return this.prisma.workflow.findMany({ where: { projectId } });
  }

  @Post()
  @ApiOperation({ summary: 'Create a workflow (with cycle detection)' })
  async createWorkflow(@Param('projectId') projectId: string, @Body() dto: CreateWorkflowDto, @Req() req: any) {
    // Topological sort cycle detection
    this.detectCycles(dto.nodes, dto.edges);

    const workflow = await this.prisma.workflow.create({
      data: {
        projectId,
        name: dto.name,
        description: dto.description,
        createdById: req.user.id,
      },
    });

    // Create nodes
    const nodeMap = new Map<string, string>(); // nodeKey → workflowJobId
    for (const node of dto.nodes) {
      const wj = await this.prisma.workflowJob.create({
        data: { workflowId: workflow.id, nodeKey: node.nodeKey, jobTemplate: node.jobTemplate },
      });
      nodeMap.set(node.nodeKey, wj.id);
    }

    // Create edges
    for (const edge of dto.edges) {
      await this.prisma.workflowDependency.create({
        data: {
          workflowId: workflow.id,
          upstreamNodeKey: edge.upstreamNodeKey,
          downstreamNodeKey: edge.downstreamNodeKey,
          condition: edge.condition,
        },
      });
    }

    return this.prisma.workflow.findUnique({
      where: { id: workflow.id },
      include: { nodes: true, deps: true },
    });
  }

  @Get(':workflowId')
  @ApiOperation({ summary: 'Get workflow definition' })
  async getWorkflow(@Param('workflowId') workflowId: string) {
    return this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { nodes: true, deps: true, runs: { orderBy: { startedAt: 'desc' }, take: 10 } },
    });
  }

  @Post(':workflowId/runs')
  @ApiOperation({ summary: 'Start a new workflow run' })
  async startRun(@Param('workflowId') workflowId: string, @Req() req: any) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { nodes: true, deps: true },
    });
    if (!workflow) throw new NotFoundException('Workflow not found');

    const run = await this.prisma.workflowRun.create({
      data: { workflowId, triggeredBy: 'manual' },
    });

    // Create jobs for root nodes (no upstream dependencies)
    const rootNodes = workflow.nodes.filter(
      (node) => !workflow.deps.some((d) => d.downstreamNodeKey === node.nodeKey),
    );

    const queue = await this.prisma.queue.findFirst({ where: { projectId: workflow.projectId } });

    for (const node of rootNodes) {
      const template = node.jobTemplate as any;
      const job = await this.prisma.job.create({
        data: {
          queueId: queue!.id,
          projectId: workflow.projectId,
          type: template.type || 'generic',
          payload: template.payload || {},
          status: JobStatus.Queued,
          priority: template.priority || 5,
          shardKey: 0,
        },
      });

      await this.prisma.workflowRunJob.create({
        data: { workflowRunId: run.id, nodeKey: node.nodeKey, workflowJobId: node.id, jobId: job.id, status: JobStatus.Queued },
      });
    }

    return this.prisma.workflowRun.findUnique({ where: { id: run.id }, include: { jobs: true } });
  }

  @Get(':workflowId/runs/:runId')
  @ApiOperation({ summary: 'Get workflow run status' })
  async getRun(@Param('runId') runId: string) {
    return this.prisma.workflowRun.findUnique({
      where: { id: runId },
      include: { jobs: { include: { job: true } } },
    });
  }

  // Topological sort cycle detection (DFS)
  private detectCycles(nodes: WorkflowNodeDto[], edges: WorkflowEdgeDto[]): void {
    const graph = new Map<string, string[]>();
    nodes.forEach((n) => graph.set(n.nodeKey, []));
    edges.forEach((e) => {
      if (!graph.has(e.upstreamNodeKey)) graph.set(e.upstreamNodeKey, []);
      graph.get(e.upstreamNodeKey)!.push(e.downstreamNodeKey);
    });

    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      inStack.add(node);
      for (const neighbor of graph.get(node) || []) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) return true;
        } else if (inStack.has(neighbor)) {
          return true; // Cycle detected
        }
      }
      inStack.delete(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node) && dfs(node)) {
        throw Object.assign(new Error('Workflow contains a cycle'), { status: 422 });
      }
    }
  }
}

// DLQ Controller
@ApiTags('dlq')
@Controller('dlq')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
class DlqController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List dead letter jobs (unresolved by default)' })
  async listDlq(@Query('queueId') queueId?: string, @Query('resolved') resolved?: string) {
    return this.prisma.deadLetterJob.findMany({
      where: {
        ...(queueId && { queueId }),
        resolved: resolved === 'true',
      },
      orderBy: { movedAt: 'desc' },
      take: 100,
    });
  }

  @Post(':id/requeue')
  @ApiOperation({ summary: 'Requeue a dead letter job' })
  async requeue(@Param('id') id: string, @Req() req: any) {
    const dlj = await this.prisma.deadLetterJob.findUniqueOrThrow({ where: { id } });
    const queue = await this.prisma.queue.findUniqueOrThrow({ where: { id: dlj.queueId } });

    const newJob = await this.prisma.job.create({
      data: {
        queueId: dlj.queueId,
        projectId: queue.projectId,
        type: dlj.jobType,
        payload: dlj.payloadSnapshot as any,
        status: JobStatus.Queued,
        priority: 5,
        shardKey: 0,
      },
    });

    await this.prisma.deadLetterJob.update({
      where: { id },
      data: { resolved: true, resolvedBy: req.user.id, resolvedAt: new Date(), resolutionAction: 'requeued' },
    });

    await this.prisma.$executeRawUnsafe(`NOTIFY job_available, '${dlj.queueId}'`).catch(() => {});
    return { requeued: true, newJobId: newJob.id };
  }

  @Post(':id/discard')
  @ApiOperation({ summary: 'Permanently discard a dead letter job' })
  async discard(@Param('id') id: string, @Req() req: any) {
    await this.prisma.deadLetterJob.update({
      where: { id },
      data: { resolved: true, resolvedBy: req.user.id, resolvedAt: new Date(), resolutionAction: 'discarded' },
    });
    return { discarded: true };
  }
}

import { SchedulerModule } from '../scheduler/scheduler.module';

@Module({ controllers: [WorkflowsController, DlqController], imports: [SchedulerModule] })
export class WorkflowsModule {}

