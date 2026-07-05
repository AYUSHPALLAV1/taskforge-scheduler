import { PrismaClient, OrgRole, RetryStrategy, JobStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding TaskForge with rich demo data...');

  /* ── Users ── */
  const pwHash = await argon2.hash('Demo1234!');
  const user = await prisma.user.upsert({
    where: { email: 'demo@taskforge.dev' },
    update: {},
    create: { email: 'demo@taskforge.dev', passwordHash: pwHash, name: 'Demo User', isActive: true },
  });
  console.log(`✅ User: ${user.email}`);

  /* ── Org ── */
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-org' },
    update: {},
    create: { name: 'TaskForge Demo Corp', slug: 'demo-org', ownerId: user.id },
  });
  console.log(`✅ Org: ${org.name}`);

  await prisma.organizationMember.upsert({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
    update: {},
    create: { orgId: org.id, userId: user.id, role: OrgRole.Owner },
  });

  /* ── Project ── */
  const project = await prisma.project.upsert({
    where: { orgId_slug: { orgId: org.id, slug: 'main-platform' } },
    update: {},
    create: { orgId: org.id, name: 'Main Platform', slug: 'main-platform', createdById: user.id },
  });
  console.log(`✅ Project: ${project.name}`);

  /* ── Retry policies ── */
  const gentle = await prisma.retryPolicy.upsert({
    where: { name: 'gentle' }, update: {},
    create: { name: 'gentle', strategy: RetryStrategy.Fixed, baseDelayMs: 30_000, maxAttempts: 3, jitter: false },
  });
  const aggressive = await prisma.retryPolicy.upsert({
    where: { name: 'aggressive' }, update: {},
    create: { name: 'aggressive', strategy: RetryStrategy.ExponentialBackoff, baseDelayMs: 1_000, maxDelayMs: 60_000, maxAttempts: 8, jitter: true },
  });
  const critical = await prisma.retryPolicy.upsert({
    where: { name: 'critical' }, update: {},
    create: { name: 'critical', strategy: RetryStrategy.ExponentialBackoff, baseDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 15, jitter: true },
  });
  console.log('✅ Retry policies: gentle, aggressive, critical');

  /* ── Queues ── */
  const mkQueue = (slug: string, name: string, priority: number, concurrency: number, policyId: string, shards = 1) =>
    prisma.queue.upsert({
      where: { projectId_slug: { projectId: project.id, slug } },
      update: {},
      create: { projectId: project.id, name, slug, priority, concurrencyLimit: concurrency, shardCount: shards, retryPolicyId: policyId },
    });

  const [defaultQ, emailQ, analyticsQ, criticalQ, backgroundQ] = await Promise.all([
    mkQueue('default',    'Default',    5, 12, aggressive.id, 3),
    mkQueue('email',      'Email',      3,  5, gentle.id),
    mkQueue('analytics',  'Analytics',  4,  8, aggressive.id, 2),
    mkQueue('critical',   'Critical',   9, 16, critical.id, 4),
    mkQueue('background', 'Background', 1,  6, gentle.id),
  ]);
  console.log('✅ Queues: default, email, analytics, critical, background');

  /* ── Jobs ── */
  const now = new Date();
  const ago = (mins: number) => new Date(now.getTime() - mins * 60_000);
  const future = (mins: number) => new Date(now.getTime() + mins * 60_000);

  const jobSpecs: Array<{
    type: string; status: JobStatus; priority?: number;
    queueId: string; payload: Record<string, unknown>;
    runAt?: Date; attemptCount?: number;
  }> = [
    // Completed (recent successes)
    { type: 'send-email',        status: JobStatus.Completed, priority: 5, queueId: emailQ.id,      payload: { to: 'alice@example.com', subject: 'Welcome to TaskForge!', attemptMs: 210 }, runAt: ago(180) },
    { type: 'send-email',        status: JobStatus.Completed, priority: 4, queueId: emailQ.id,      payload: { to: 'bob@example.com', subject: 'Invoice #4421', attemptMs: 195 }, runAt: ago(120) },
    { type: 'send-email',        status: JobStatus.Completed, priority: 6, queueId: emailQ.id,      payload: { to: 'charlie@acme.com', subject: 'Password reset', attemptMs: 184 }, runAt: ago(60) },
    { type: 'process-data',      status: JobStatus.Completed, priority: 7, queueId: defaultQ.id,    payload: { recordId: 'rec-001', rows: 15000, duration: 4120 }, runAt: ago(90) },
    { type: 'process-data',      status: JobStatus.Completed, priority: 7, queueId: defaultQ.id,    payload: { recordId: 'rec-002', rows: 23000, duration: 6780 }, runAt: ago(70) },
    { type: 'generate-report',   status: JobStatus.Completed, priority: 5, queueId: analyticsQ.id,  payload: { reportType: 'daily', rows: 4200, outputSize: '2.1MB' }, runAt: ago(50) },
    { type: 'extract-sales',     status: JobStatus.Completed, priority: 6, queueId: analyticsQ.id,  payload: { date: '2026-07-04', records: 8900 }, runAt: ago(240) },
    { type: 'enrich-geo',        status: JobStatus.Completed, priority: 5, queueId: analyticsQ.id,  payload: { batchSize: 500, enriched: 498 }, runAt: ago(200) },
    { type: 'aggregate-metrics', status: JobStatus.Completed, priority: 5, queueId: analyticsQ.id,  payload: { period: '1h', metrics: 42 }, runAt: ago(45) },
    { type: 'validate-data',     status: JobStatus.Completed, priority: 4, queueId: defaultQ.id,    payload: { schema: 'user.v2', errors: 0 }, runAt: ago(30) },
    { type: 'ai_summarize',      status: JobStatus.Completed, priority: 3, queueId: backgroundQ.id, payload: { jobId: 'ref-001', model: 'gemini-flash' }, runAt: ago(25) },
    { type: 'ai_summarize',      status: JobStatus.Completed, priority: 3, queueId: backgroundQ.id, payload: { jobId: 'ref-002', model: 'gemini-flash' }, runAt: ago(20) },
    { type: 'email-report',      status: JobStatus.Completed, priority: 4, queueId: emailQ.id,      payload: { to: 'ops@taskforge.dev', subject: 'Nightly digest' }, runAt: ago(15) },

    // Running (active right now)
    { type: 'process-data',    status: JobStatus.Running, priority: 8, queueId: defaultQ.id,   payload: { recordId: 'rec-live-01', rows: 50000 }, attemptCount: 1 },
    { type: 'process-data',    status: JobStatus.Running, priority: 7, queueId: defaultQ.id,   payload: { recordId: 'rec-live-02', rows: 18000 }, attemptCount: 1 },
    { type: 'generate-report', status: JobStatus.Running, priority: 6, queueId: analyticsQ.id, payload: { reportType: 'weekly', format: 'pdf' }, attemptCount: 1 },
    { type: 'send-email',      status: JobStatus.Running, priority: 5, queueId: emailQ.id,     payload: { to: 'batch@newsletter.com', template: 'promo-v3', batchSize: 200 }, attemptCount: 1 },
    { type: 'ai_summarize',    status: JobStatus.Running, priority: 4, queueId: backgroundQ.id, payload: { jobId: 'ref-003', model: 'gemini-flash' }, attemptCount: 1 },

    // Queued (waiting to be picked up)
    { type: 'send-email',      status: JobStatus.Queued, priority: 6,  queueId: emailQ.id,      payload: { to: 'diana@example.com', subject: 'Subscription renewal' } },
    { type: 'send-email',      status: JobStatus.Queued, priority: 5,  queueId: emailQ.id,      payload: { to: 'evan@example.com', subject: 'Trial ending soon' } },
    { type: 'send-email',      status: JobStatus.Queued, priority: 4,  queueId: emailQ.id,      payload: { to: 'fiona@example.com', subject: 'Weekly newsletter' } },
    { type: 'process-data',    status: JobStatus.Queued, priority: 7,  queueId: defaultQ.id,    payload: { recordId: 'rec-q-01', rows: 7500 } },
    { type: 'process-data',    status: JobStatus.Queued, priority: 6,  queueId: defaultQ.id,    payload: { recordId: 'rec-q-02', rows: 3200 } },
    { type: 'validate-data',   status: JobStatus.Queued, priority: 5,  queueId: defaultQ.id,    payload: { schema: 'order.v3' } },
    { type: 'extract-sales',   status: JobStatus.Queued, priority: 6,  queueId: analyticsQ.id,  payload: { date: '2026-07-05' } },
    { type: 'aggregate-metrics', status: JobStatus.Queued, priority: 5, queueId: analyticsQ.id, payload: { period: '24h' } },
    { type: 'ai_summarize',    status: JobStatus.Queued, priority: 3,  queueId: backgroundQ.id, payload: { jobId: 'ref-004' } },
    { type: 'ai_summarize',    status: JobStatus.Queued, priority: 3,  queueId: backgroundQ.id, payload: { jobId: 'ref-005' } },

    // Scheduled (future)
    { type: 'generate-report',   status: JobStatus.Scheduled, priority: 5, queueId: analyticsQ.id,  payload: { reportType: 'monthly', schedule: 'nightly' }, runAt: future(120) },
    { type: 'send-email',        status: JobStatus.Scheduled, priority: 4, queueId: emailQ.id,      payload: { to: 'digest@corp.com', subject: 'Morning digest' }, runAt: future(240) },
    { type: 'extract-sales',     status: JobStatus.Scheduled, priority: 6, queueId: analyticsQ.id,  payload: { date: '2026-07-06' }, runAt: future(480) },
    { type: 'aggregate-metrics', status: JobStatus.Scheduled, priority: 5, queueId: analyticsQ.id,  payload: { period: '7d' }, runAt: future(60) },

    // Failed
    { type: 'send-email',   status: JobStatus.Failed, priority: 6, queueId: emailQ.id,    payload: { to: 'broken@invalid', error: 'DNS lookup failed' }, attemptCount: 3, runAt: ago(100) },
    { type: 'process-data', status: JobStatus.Failed, priority: 7, queueId: defaultQ.id,  payload: { recordId: 'rec-bad-01', error: 'Schema mismatch' }, attemptCount: 4, runAt: ago(80) },
    { type: 'process-data', status: JobStatus.Failed, priority: 8, queueId: defaultQ.id,  payload: { recordId: 'rec-bad-02', error: 'OOM killed' }, attemptCount: 2, runAt: ago(55) },
    { type: 'ai_summarize', status: JobStatus.Failed, priority: 3, queueId: backgroundQ.id, payload: { jobId: 'ref-bad', error: 'API quota exceeded' }, attemptCount: 5, runAt: ago(40) },

    // Dead Letter
    { type: 'send-email',      status: JobStatus.DeadLetter, priority: 5, queueId: emailQ.id,   payload: { to: 'noreply@void.invalid', error: 'Max retries exceeded' }, attemptCount: 8, runAt: ago(300) },
    { type: 'process-data',    status: JobStatus.DeadLetter, priority: 7, queueId: defaultQ.id, payload: { recordId: 'rec-dlq-01', error: 'Unrecoverable error' }, attemptCount: 8, runAt: ago(250) },
    { type: 'validate-data',   status: JobStatus.DeadLetter, priority: 4, queueId: defaultQ.id, payload: { schema: 'broken.schema', error: 'Schema not found' }, attemptCount: 8, runAt: ago(200) },

    // Cancelled
    { type: 'generate-report', status: JobStatus.Cancelled, priority: 3, queueId: analyticsQ.id, payload: { reportType: 'ad-hoc', cancelledBy: user.id }, runAt: ago(150) },
    { type: 'send-email',      status: JobStatus.Cancelled, priority: 2, queueId: emailQ.id,     payload: { to: 'test@test.com', reason: 'User cancelled' }, runAt: ago(60) },

    // Critical queue jobs
    { type: 'alert-oncall', status: JobStatus.Completed, priority: 9, queueId: criticalQ.id, payload: { channel: '#ops', message: 'Deploy succeeded', severity: 'info' }, runAt: ago(10) },
    { type: 'alert-oncall', status: JobStatus.Queued,    priority: 9, queueId: criticalQ.id, payload: { channel: '#alerts', message: 'Error rate spike', severity: 'critical' } },
    { type: 'alert-oncall', status: JobStatus.Running,   priority: 9, queueId: criticalQ.id, payload: { channel: '#oncall', message: 'DB replication lag', severity: 'warning' }, attemptCount: 1 },
  ];

  let created = 0;
  for (const spec of jobSpecs) {
    await prisma.job.create({
      data: {
        queueId:      spec.queueId,
        projectId:    project.id,
        type:         spec.type,
        payload:      spec.payload as any,
        status:       spec.status,
        priority:     spec.priority ?? 5,
        runAt:        spec.runAt ?? now,
        attemptCount: spec.attemptCount ?? 0,
        createdById:  user.id,
      },
    });
    created++;
  }
  console.log(`✅ Created ${created} demo jobs across 5 queues`);

  /* ── Workflow ── */
  let workflow = await prisma.workflow.findFirst({
    where: { projectId: project.id, name: 'Nightly Reporting Pipeline' },
  });
  if (!workflow) {
    workflow = await prisma.workflow.create({
      data: {
        projectId:   project.id,
        name:        'Nightly Reporting Pipeline',
        description: 'Extract → Enrich → Validate → Aggregate → Notify',
        createdById: user.id,
      },
    });
  }

  const nodes = [
    { nodeKey: 'extract',      jobTemplate: { type: 'extract-sales',     priority: 5 } },
    { nodeKey: 'enrich',       jobTemplate: { type: 'enrich-geo',         priority: 5 } },
    { nodeKey: 'validate',     jobTemplate: { type: 'validate-data',      priority: 5 } },
    { nodeKey: 'aggregate',    jobTemplate: { type: 'aggregate-metrics',  priority: 5 } },
    { nodeKey: 'notify_ok',    jobTemplate: { type: 'email-report',       priority: 3 } },
    { nodeKey: 'notify_fail',  jobTemplate: { type: 'alert-oncall',       priority: 9 } },
  ];
  for (const n of nodes) {
    const exists = await prisma.workflowJob.findFirst({ where: { workflowId: workflow.id, nodeKey: n.nodeKey } });
    if (!exists) await prisma.workflowJob.create({ data: { workflowId: workflow.id, ...n, jobTemplate: n.jobTemplate as any } });
  }
  console.log(`✅ Workflow: ${workflow.name} (${nodes.length} nodes)`);

  console.log('\n🎉 Done! Login at http://localhost:5173 with: demo@taskforge.dev / Demo1234!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
