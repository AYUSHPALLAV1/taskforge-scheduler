import { Module } from '@nestjs/common';
import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@ApiTags('system')
@Controller()
class SystemController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  @Get('healthz')
  @ApiOperation({ summary: 'Health check — keeps Render free-tier warm (UptimeRobot pings this)' })
  async health() {
    const [dbOk, redisOk] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.get('health_check').then(() => true).catch(() => false),
    ]);

    return {
      status: dbOk && redisOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { database: dbOk ? 'ok' : 'error', redis: redisOk ? 'ok' : 'error' },
    };
  }

  @Get('readyz')
  @ApiOperation({ summary: 'Readiness probe' })
  ready() {
    return { ready: true, timestamp: new Date().toISOString() };
  }
}

@Module({ controllers: [SystemController] })
export class SystemModule {}
