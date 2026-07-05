import { PrismaClient, OrgRole, RetryStrategy, JobStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding TaskForge demo data...');

  // Create demo user
  const passwordHash = await argon2.hash('Demo1234!');
  const user = await prisma.user.upsert({
    where: { email: 'demo@taskforge.dev' },
    update: {},
    create: {
      email: 'demo@taskforge.dev',
      passwordHash,
      name: 'Demo User',
      isActive: true,
    },
  });
  console.log(`✅ User: ${user.email}`);

  // Create demo organization
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-org' },
    update: {},
    create: {
      name: 'Demo Organization',
      slug: 'demo-org',
      ownerId: user.id,
    },
  });
  console.log(`✅ Organization: ${org.name}`);

  // Add user as Owner
  await prisma.organizationMember.upsert({
    where: { orgId_userId: { orgId: org.id, userId: user.id } },
    update: {},
    create: {
      orgId: org.id,
      userId: user.id,
      role: OrgRole.Owner,
    },
  });

  // Create demo project
  const project = await prisma.project.upsert({
    where: { orgId_slug: { orgId: org.id, slug: 'demo-project' } },
    update: {},
    create: {
      orgId: org.id,
      name: 'Demo Project',
      slug: 'demo-project',
      createdById: user.id,
    },
  });
  console.log(`✅ Project: ${project.name}`);

  // Create retry policies
  const gentlePolicy = await prisma.retryPolicy.upsert({
    where: { name: 'gentle' },
    update: {},
    create: {
      name: 'gentle',
      strategy: RetryStrategy.Fixed,
      baseDelayMs: 30000,
      maxAttempts: 3,
      jitter: false,
    },
  });

  const aggressivePolicy = await prisma.retryPolicy.upsert({
    where: { name: 'aggressive' },
    update: {},
    create: {
      name: 'aggressive',
      strategy: RetryStrategy.ExponentialBackoff,
      baseDelayMs: 1000,
      maxDelayMs: 60000,
      maxAttempts: 8,
      jitter: true,
    },
  });
  console.log('✅ Retry policies: gentle, aggressive');

  // Create demo queues
  const defaultQueue = await prisma.queue.upsert({
    where: { projectId_slug: { projectId: project.id, slug: 'default' } },
    update: {},
    create: {
      projectId: project.id,
      name: 'Default Queue',
      slug: 'default',
      priority: 5,
      concurrencyLimit: 10,
      retryPolicyId: aggressivePolicy.id,
    },
  });

  const emailQueue = await prisma.queue.upsert({
    where: { projectId_slug: { projectId: project.id, slug: 'email' } },
    update: {},
    create: {
      projectId: project.id,
      name: 'Email Queue',
      slug: 'email',
      priority: 3,
      concurrencyLimit: 5,
      retryPolicyId: gentlePolicy.id,
    },
  });
  console.log('✅ Queues: default, email');

  // Create sample jobs in various states
  const jobsData = [
    { type: 'send-email', status: JobStatus.Completed, payload: { to: 'a@b.com', subject: 'Welcome' } },
    { type: 'send-email', status: JobStatus.Queued, payload: { to: 'c@d.com', subject: 'Reminder' } },
    { type: 'process-data', status: JobStatus.Running, payload: { recordId: 'abc-123' } },
    { type: 'process-data', status: JobStatus.Failed, payload: { recordId: 'xyz-999' } },
    { type: 'generate-report', status: JobStatus.Queued, payload: { reportType: 'monthly' } },
  ];

  for (const jobData of jobsData) {
    await prisma.job.create({
      data: {
        queueId: jobData.type === 'send-email' ? emailQueue.id : defaultQueue.id,
        projectId: project.id,
        type: jobData.type,
        payload: jobData.payload,
        status: jobData.status,
        createdById: user.id,
      },
    });
  }
  console.log(`✅ Created ${jobsData.length} sample jobs`);

  // Create a demo workflow (nightly reporting pipeline)
  const workflow = await prisma.workflow.create({
    data: {
      projectId: project.id,
      name: 'Nightly Reporting Pipeline',
      description: 'Extract → Enrich → Validate → Aggregate → Notify',
      createdById: user.id,
    },
  });

  // Create workflow nodes
  const nodes = [
    { nodeKey: 'extract', jobTemplate: { type: 'extract-sales', priority: 5 } },
    { nodeKey: 'enrich', jobTemplate: { type: 'enrich-geo', priority: 5 } },
    { nodeKey: 'validate', jobTemplate: { type: 'validate-data', priority: 5 } },
    { nodeKey: 'aggregate', jobTemplate: { type: 'aggregate-metrics', priority: 5 } },
    { nodeKey: 'notify_ok', jobTemplate: { type: 'email-report', priority: 3 } },
    { nodeKey: 'notify_fail', jobTemplate: { type: 'alert-oncall', priority: 9 } },
  ];

  for (const node of nodes) {
    await prisma.workflowJob.create({
      data: { workflowId: workflow.id, ...node },
    });
  }
  console.log(`✅ Workflow: ${workflow.name} with ${nodes.length} nodes`);

  console.log('\n🎉 Seed complete! Login with: demo@taskforge.dev / Demo1234!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
