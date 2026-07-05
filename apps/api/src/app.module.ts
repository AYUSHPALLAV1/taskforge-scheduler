import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

// Core modules
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';

// Feature modules
import { AuthModule } from './auth/auth.module';
import { RbacModule } from './rbac/rbac.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { ProjectsModule } from './projects/projects.module';
import { QueuesModule } from './queues/queues.module';
import { JobsModule } from './jobs/jobs.module';
import { WorkerModule } from './worker/worker.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { WebsocketModule } from './websocket/websocket.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { AiModule } from './ai/ai.module';
import { SystemModule } from './common/system/system.module';

// Middleware
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

@Module({
  imports: [
    // Config (loads .env)
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '../../.env' }),

    // Cron scheduling (for scheduler tick)
    ScheduleModule.forRoot(),

    // Infrastructure
    PrismaModule,
    RedisModule,

    // Auth & RBAC
    AuthModule,
    RbacModule,

    // Business features
    OrganizationsModule,
    ProjectsModule,
    QueuesModule,
    JobsModule,
    WorkflowsModule,

    // Worker + Scheduler (in-process on free tier)
    WorkerModule,
    SchedulerModule,

    // Real-time
    WebsocketModule,

    // AI summaries
    AiModule,

    // Health probes
    SystemModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
