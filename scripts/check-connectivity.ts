/**
 * Connectivity diagnostic script — tests Neon (PostgreSQL) and Upstash (Redis)
 * Run with: npx -y dotenv-cli -e .env -- tsx scripts/check-connectivity.ts
 */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

async function checkNeon() {
  console.log('\n🔵 Testing Neon PostgreSQL...');
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1 AS ping`;
    const ms = Date.now() - t0;

    const [jobCount] = await prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Job"`;
    const [queueCount] = await prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Queue"`;
    const [workerCount] = await prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "Worker"`;
    const [userCount] = await prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM "User"`;

    console.log(`  ✅ Connected in ${ms}ms`);
    console.log(`  📊 Jobs: ${jobCount.count}  |  Queues: ${queueCount.count}  |  Workers: ${workerCount.count}  |  Users: ${userCount.count}`);
    return true;
  } catch (e: any) {
    console.error('  ❌ Neon FAILED:', e.message);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

async function checkRedis() {
  console.log('\n🔴 Testing Upstash Redis...');
  const url = process.env.REDIS_URL!;
  const redis = new Redis(url, { tls: url.startsWith('rediss://') ? {} : undefined, lazyConnect: true, connectTimeout: 8000 });
  try {
    const t0 = Date.now();
    await redis.connect();
    const pong = await redis.ping();
    const ms = Date.now() - t0;
    const info = await redis.info('server').then(i => {
      const m = i.match(/redis_version:(.+)/); return m ? m[1].trim() : '?';
    });
    const dbSize = await redis.dbsize();
    console.log(`  ✅ PING→${pong} in ${ms}ms  |  Redis v${info}  |  Keys: ${dbSize}`);

    // Write/Read test
    await redis.set('tf:health:check', JSON.stringify({ ts: new Date().toISOString() }), 'EX', 30);
    const val = await redis.get('tf:health:check');
    console.log(`  ✅ Write/Read test OK:`, JSON.parse(val!));
    return true;
  } catch (e: any) {
    console.error('  ❌ Redis FAILED:', e.message);
    return false;
  } finally {
    redis.disconnect();
  }
}

async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║  TaskForge Connectivity Diagnostics  ║');
  console.log('╚══════════════════════════════════════╝');

  const neonOk  = await checkNeon();
  const redisOk = await checkRedis();

  console.log('\n═══════════════════════════════════════');
  console.log('Summary:');
  console.log(`  Neon PostgreSQL : ${neonOk  ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
  console.log(`  Upstash Redis   : ${redisOk ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
  console.log('═══════════════════════════════════════\n');
  process.exit(neonOk && redisOk ? 0 : 1);
}

main();
