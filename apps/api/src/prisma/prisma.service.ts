import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // In development: use direct URL to avoid pgbouncer connection_limit issues.
    // In production (Render): use DATABASE_URL_POOLED for scalability.
    const isProd = process.env.NODE_ENV === 'production';
    super({
      datasources: {
        db: {
          url: isProd
            ? (process.env.DATABASE_URL_POOLED || process.env.DATABASE_URL)
            : (process.env.DATABASE_URL || process.env.DATABASE_URL_POOLED),
        },
      },
      log: ['error'], // Always errors-only — query logging floods the pool
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Prisma connected (pooled connection)');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
