import { PrismaClient, JobStatus, WorkerStatus } from '@prisma/client';

const prisma = new PrismaClient({ log: [] });

async function main() {
  console.log('Seeding dashboard with active data...');

  const org = await prisma.organization.findFirst();
  const project = await prisma.project.findFirst({ where: { orgId: org?.id } });
  const queue = await prisma.queue.findFirst({ where: { projectId: project?.id } });

  if (!project || !queue) {
    console.error('Project or Queue not found!');
    return;
  }

  // Add fake workers
  const workerNames = ['us-east-worker-1', 'eu-west-processor-2', 'gpu-node-alpha', 'analytics-worker'];
  for (const name of workerNames) {
    const worker = await prisma.worker.create({
      data: {
        hostname: name,
        pid: Math.floor(Math.random() * 10000) + 1000,
        version: '1.2.0',
        status: WorkerStatus.Online,
        maxConcurrency: Math.floor(Math.random() * 10) + 2,
        currentLoad: Math.floor(Math.random() * 3),
        startedAt: new Date(Date.now() - Math.random() * 86400000), // Up to 1 day ago
        lastHeartbeatAt: new Date(),
        metadata: { region: name.split('-')[0] },
      }
    });

    // Add some heartbeats for the graph
    for (let i = 0; i < 5; i++) {
      await prisma.workerHeartbeat.create({
        data: {
          workerId: worker.id,
          cpuUsage: Math.random() * 80 + 10,
          memoryUsage: Math.random() * 70 + 20,
          activeJobCount: Math.floor(Math.random() * 3),
          timestamp: new Date(Date.now() - (i * 60000)), // Every minute back
        }
      });
    }
  }
  console.log(`✅ Added ${workerNames.length} simulated workers`);

  // Add fake jobs
  const jobTypes = ['process-data', 'generate-report', 'extract-sales', 'enrich-geo', 'send-email'];
  const statuses = [JobStatus.Completed, JobStatus.Failed, JobStatus.Queued, JobStatus.Completed, JobStatus.Completed];
  let jobsCreated = 0;

  for (let i = 0; i < 45; i++) {
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const jobType = jobTypes[Math.floor(Math.random() * jobTypes.length)];
    const dateOffset = Math.random() * 86400000; // Past 24 hours
    const runAt = new Date(Date.now() - dateOffset);

    await prisma.job.create({
      data: {
        projectId: project.id,
        queueId: queue.id,
        type: jobType,
        payload: { targetId: Math.floor(Math.random() * 10000), retry: true },
        status: status,
        runAt: runAt,
        attemptCount: status === JobStatus.Failed ? 3 : (status === JobStatus.Completed ? 1 : 0),
      }
    });
    jobsCreated++;
  }
  console.log(`✅ Added ${jobsCreated} jobs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
