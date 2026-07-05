import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import Redis from 'ioredis';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/',
})
export class TaskforgeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TaskforgeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  afterInit(server: any) {
    // Attach Redis adapter for cross-instance fan-out
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        const pubClient = new Redis(redisUrl, { lazyConnect: false });
        const subClient = pubClient.duplicate();
        // Use this.server (the Socket.io Server) not the afterInit argument
        if (this.server && typeof this.server.adapter === 'function') {
          this.server.adapter(createAdapter(pubClient, subClient));
          this.logger.log('✅ Socket.io Redis adapter attached');
        } else {
          this.logger.warn('⚠ Redis adapter skipped — server not ready');
        }
      } catch (err) {
        this.logger.warn('⚠ Redis adapter attach failed (local dev)', err.message);
      }
    }

    // Subscribe to outbox events dispatched by SchedulerService
    const sub = this.redis.getSubscriber?.();
    if (sub) {
      sub.on('message', (channel, message) => {
        try {
          const data = JSON.parse(message);
          this.broadcastEvent(data);
        } catch (_e) {}
      });
      sub.subscribe('taskforge:events').catch(() => {});
    } else {
      this.logger.warn('⚠ Redis subscriber not available — real-time events disabled');
    }
    this.logger.log('✅ WebSocket Gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      // JWT auth at handshake — token in auth payload (not query string)
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token) as { sub: string; email: string };
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

      if (!user || !user.isActive) {
        client.disconnect();
        return;
      }

      // Store user context on socket
      (client as any).userId = user.id;

      // Join org and project rooms based on memberships
      const memberships = await this.prisma.organizationMember.findMany({
        where: { userId: user.id },
        include: {
          org: {
            include: {
              projects: { where: { deletedAt: null } },
            },
          },
        },
      });

      for (const membership of memberships) {
        await client.join(`org:${membership.orgId}`);
        for (const project of membership.org.projects) {
          await client.join(`project:${project.id}`);
        }
      }

      this.logger.debug(`Client connected: ${client.id} (user: ${user.email})`);
    } catch (err) {
      this.logger.warn(`WebSocket connection rejected: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  // Subscribe to a specific project's room (client-requested)
  @SubscribeMessage('join_project')
  async handleJoinProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    await client.join(`project:${data.projectId}`);
    return { joined: data.projectId };
  }

  @SubscribeMessage('leave_project')
  async handleLeaveProject(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { projectId: string },
  ) {
    await client.leave(`project:${data.projectId}`);
    return { left: data.projectId };
  }

  // Broadcast an event to the appropriate room
  private broadcastEvent(data: any) {
    if (!data || !data.event) return;

    const payload = data.data || data;

    // Route to project room
    if (payload.projectId) {
      this.server.to(`project:${payload.projectId}`).emit(data.event, payload);
    }

    // Route to org room
    if (payload.orgId) {
      this.server.to(`org:${payload.orgId}`).emit(data.event, payload);
    }

    // Broadcast global events (worker status)
    if (data.event?.startsWith('worker.')) {
      this.server.emit(data.event, payload);
    }
  }

  // Method for other services to emit events directly
  emit(room: string, event: string, data: object) {
    this.server.to(room).emit(event, data);
  }
}
