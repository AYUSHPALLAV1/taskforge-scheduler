import { Module } from '@nestjs/common';
import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsEmail, IsEnum } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { OrgRole } from '@prisma/client';

class CreateOrgDto {
  @IsString() name: string;
  @IsString() slug: string;
}
class InviteMemberDto {
  @IsEmail() email: string;
  @IsEnum(OrgRole) role: OrgRole;
}

@ApiTags('organizations')
@Controller('orgs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(private readonly prisma: PrismaService, private readonly rbac: RbacService) {}

  @Get()
  @ApiOperation({ summary: 'List organizations the current user belongs to' })
  async listOrgs(@Req() req: any) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId: req.user.id },
      include: { org: true },
    });
    return memberships.map((m) => ({ ...m.org, role: m.role }));
  }

  @Post()
  @ApiOperation({ summary: 'Create a new organization' })
  async createOrg(@Body() dto: CreateOrgDto, @Req() req: any) {
    const org = await this.prisma.organization.create({
      data: { name: dto.name, slug: dto.slug, ownerId: req.user.id },
    });
    await this.prisma.organizationMember.create({
      data: { orgId: org.id, userId: req.user.id, role: OrgRole.Owner },
    });
    await this.rbac.logAuditEvent({ orgId: org.id, actorUserId: req.user.id, action: 'org.created', resourceType: 'organization', resourceId: org.id });
    return org;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get organization details' })
  async getOrg(@Param('id') id: string) {
    return this.prisma.organization.findUniqueOrThrow({ where: { id } });
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'List organization members' })
  async listMembers(@Param('id') id: string) {
    return this.prisma.organizationMember.findMany({
      where: { orgId: id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Invite a member to the organization' })
  async inviteMember(@Param('id') id: string, @Body() dto: InviteMemberDto, @Req() req: any) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new NotFoundException('User not found');

    const member = await this.prisma.organizationMember.upsert({
      where: { orgId_userId: { orgId: id, userId: user.id } },
      create: { orgId: id, userId: user.id, role: dto.role, invitedBy: req.user.id },
      update: { role: dto.role },
    });
    await this.rbac.logAuditEvent({ orgId: id, actorUserId: req.user.id, action: 'member.invited', resourceType: 'member', resourceId: user.id, metadata: { role: dto.role } });
    await this.rbac.invalidateCache(user.id, id);
    return member;
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a member from the organization' })
  async removeMember(@Param('id') id: string, @Param('userId') userId: string, @Req() req: any) {
    await this.prisma.organizationMember.delete({ where: { orgId_userId: { orgId: id, userId } } });
    await this.rbac.invalidateCache(userId, id);
    await this.rbac.logAuditEvent({ orgId: id, actorUserId: req.user.id, action: 'member.removed', resourceType: 'member', resourceId: userId });
    return { removed: true };
  }
}

@Module({ controllers: [OrganizationsController] })
export class OrganizationsModule {}
