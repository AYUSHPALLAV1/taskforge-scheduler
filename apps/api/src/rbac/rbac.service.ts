import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { OrgRole } from '../common/enums';

// Complete permission matrix per role
const ROLE_PERMISSIONS: Record<OrgRole, string[]> = {
  Owner: [
    'org:delete', 'org:transfer', 'org:billing',
    'member:invite', 'member:remove', 'member:manage',
    'project:create', 'project:delete', 'project:manage',
    'queue:create', 'queue:delete', 'queue:pause', 'queue:resume', 'queue:manage',
    'job:create', 'job:cancel', 'job:retry', 'job:view', 'job:manage',
    'apikey:create', 'apikey:delete',
    'workflow:create', 'workflow:delete', 'workflow:run',
    'dlq:requeue', 'dlq:discard', 'dlq:view',
    'audit:view',
    'worker:view',
  ],
  Admin: [
    'member:invite', 'member:remove',
    'project:create', 'project:manage',
    'queue:create', 'queue:delete', 'queue:pause', 'queue:resume', 'queue:manage',
    'job:create', 'job:cancel', 'job:retry', 'job:view', 'job:manage',
    'apikey:create', 'apikey:delete',
    'workflow:create', 'workflow:delete', 'workflow:run',
    'dlq:requeue', 'dlq:discard', 'dlq:view',
    'worker:view',
  ],
  Member: [
    'job:create', 'job:cancel', 'job:retry', 'job:view',
    'queue:pause', 'queue:resume', 'queue:view',
    'dlq:view',
    'worker:view',
  ],
  Viewer: [
    'job:view', 'queue:view', 'dlq:view', 'worker:view',
  ],
};

@Injectable()
export class RbacService {
  private readonly logger = new Logger(RbacService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getEffectivePermissions(userId: string, orgId: string, projectId?: string): Promise<string[]> {
    const cacheKey = `${userId}:${projectId || orgId}`;

    // Check Redis cache first
    const cached = await this.redis.getCachedPermissions(userId, projectId || orgId);
    if (cached) return cached;

    // Get org-level role
    const member = await this.prisma.organizationMember.findFirst({
      where: { orgId, userId },
    });
    if (!member) return [];

    let role = member.role;

    // Check per-project override
    if (projectId) {
      const override = await this.prisma.projectRoleOverride.findFirst({
        where: { projectId, userId },
      });
      if (override) role = override.role;
    }

    const permissions = ROLE_PERMISSIONS[role] || [];

    // Cache for 5 seconds
    await this.redis.cachePermissions(userId, projectId || orgId, permissions, 5);

    return permissions;
  }

  async hasPermission(userId: string, orgId: string, permission: string, projectId?: string): Promise<boolean> {
    const permissions = await this.getEffectivePermissions(userId, orgId, projectId);
    return permissions.includes(permission);
  }

  async getUserRole(userId: string, orgId: string): Promise<OrgRole | null> {
    const member = await this.prisma.organizationMember.findFirst({
      where: { orgId, userId },
    });
    return (member?.role as any) || null;
  }

  async invalidateCache(userId: string, orgId: string): Promise<void> {
    await this.redis.invalidatePermissionCache(userId, orgId);
  }

  async logAuditEvent(params: {
    orgId: string;
    actorUserId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          orgId: params.orgId,
          actorUserId: params.actorUserId,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId,
          metadata: (params.metadata || {}) as any,
        },
      });
    } catch (err) {
      // Audit failures should never break the main operation
      this.logger.error('Failed to write audit log', err);
    }
  }
}
