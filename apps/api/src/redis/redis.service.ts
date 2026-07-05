import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private subscriber: Redis; // dedicated subscriber connection

  onModuleInit() {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL environment variable is not set');

    this.client = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: false,
    });

    this.subscriber = new Redis(url, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: false,
    });

    this.client.on('connect', () => this.logger.log('✅ Redis client connected'));
    this.client.on('error', (err) => this.logger.error('Redis client error', err.message));
    this.subscriber.on('connect', () => this.logger.log('✅ Redis subscriber connected'));
    this.subscriber.on('error', (err) => this.logger.error('Redis subscriber error', err.message));
  }

  async onModuleDestroy() {
    await this.client?.quit();
    await this.subscriber?.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  getSubscriber(): Redis {
    return this.subscriber;
  }

  // ===========================
  // Token bucket rate limiting (atomic Lua script)
  // ===========================
  async checkRateLimit(key: string, limitCount: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number }> {
    const luaScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      
      local count = redis.call('INCR', key)
      if count == 1 then
        redis.call('EXPIRE', key, window)
      end
      
      if count > limit then
        return {0, 0}
      end
      return {1, limit - count}
    `;

    const result = await this.client.eval(
      luaScript,
      1,
      `rate:${key}`,
      limitCount.toString(),
      windowSeconds.toString(),
      Date.now().toString(),
    ) as [number, number];

    return { allowed: result[0] === 1, remaining: result[1] };
  }

  // ===========================
  // Redlock-style distributed lock
  // ===========================
  async acquireLock(lockKey: string, ttlMs: number): Promise<string | null> {
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const result = await this.client.set(`lock:${lockKey}`, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  async renewLock(lockKey: string, token: string, ttlMs: number): Promise<boolean> {
    const luaScript = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('PEXPIRE', KEYS[1], ARGV[2])
      end
      return 0
    `;
    const result = await this.client.eval(luaScript, 1, `lock:${lockKey}`, token, ttlMs.toString()) as number;
    return result === 1;
  }

  async releaseLock(lockKey: string, token: string): Promise<boolean> {
    const luaScript = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `;
    const result = await this.client.eval(luaScript, 1, `lock:${lockKey}`, token) as number;
    return result === 1;
  }

  // ===========================
  // Pub/Sub helpers
  // ===========================
  async publish(channel: string, message: object): Promise<void> {
    await this.client.publish(channel, JSON.stringify(message));
  }

  async subscribe(channel: string, callback: (message: object) => void): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, msg) => {
      if (ch === channel) {
        try {
          callback(JSON.parse(msg));
        } catch (_e) {
          this.logger.error(`Failed to parse message from ${channel}`);
        }
      }
    });
  }

  // ===========================
  // Permission cache
  // ===========================
  async cachePermissions(userId: string, projectId: string, permissions: string[], ttlSeconds = 5): Promise<void> {
    await this.client.setex(`perms:${userId}:${projectId}`, ttlSeconds, JSON.stringify(permissions));
  }

  async getCachedPermissions(userId: string, projectId: string): Promise<string[] | null> {
    const cached = await this.client.get(`perms:${userId}:${projectId}`);
    return cached ? JSON.parse(cached) : null;
  }

  async invalidatePermissionCache(userId: string, orgId: string): Promise<void> {
    const keys = await this.client.keys(`perms:${userId}:*`);
    if (keys.length > 0) await this.client.del(...keys);
  }

  // ===========================
  // General cache helpers
  // ===========================
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }
}
