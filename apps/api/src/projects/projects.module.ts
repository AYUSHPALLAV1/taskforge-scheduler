import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';

class CreateProjectDto {
  @IsString() name: string;
  @IsString() slug: string;
}

@ApiTags('projects')
@Controller('orgs/:orgId/projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProjectsController {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService) {}

  @Get()
  @ApiOperation({ summary: 'List projects in an organization' })
  async listProjects(@Param('orgId') orgId: string) {
    return this.prisma.project.findMany({ where: { orgId, deletedAt: null } });
  }

  @Post()
  @ApiOperation({ summary: 'Create a project' })
  async createProject(@Param('orgId') orgId: string, @Body() dto: CreateProjectDto, @Req() req: any) {
    const project = await this.prisma.project.create({
      data: { orgId, name: dto.name, slug: dto.slug, createdById: req.user.id },
    });
    await this.rbac.logAuditEvent({ orgId, actorUserId: req.user.id, action: 'project.created', resourceType: 'project', resourceId: project.id });
    return project;
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Get a project' })
  async getProject(@Param('projectId') projectId: string) {
    return this.prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  }

  @Delete(':projectId')
  @ApiOperation({ summary: 'Soft-delete a project' })
  async deleteProject(@Param('projectId') projectId: string, @Req() req: any) {
    const project = await this.prisma.project.update({
      where: { id: projectId }, data: { deletedAt: new Date() },
    });
    await this.rbac.logAuditEvent({ orgId: project.orgId, actorUserId: req.user.id, action: 'project.deleted', resourceType: 'project', resourceId: projectId });
    return { deleted: true };
  }
}

@Module({ controllers: [ProjectsController] })
export class ProjectsModule {}
