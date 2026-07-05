// TaskForge — Shared TypeScript Types
// Used by both apps/api and apps/web

// ===========================
// ENUMS (mirroring Prisma)
// ===========================

export type OrgRole = 'Owner' | 'Admin' | 'Member' | 'Viewer';

export type JobStatus =
  | 'Scheduled'
  | 'Queued'
  | 'Claimed'
  | 'Running'
  | 'Completed'
  | 'Failed'
  | 'DeadLetter'
  | 'Cancelled';

export type ExecutionStatus = 'Running' | 'Completed' | 'Failed' | 'TimedOut';

export type WorkerStatus = 'Online' | 'Draining' | 'Offline';

export type RetryStrategy = 'Fixed' | 'Linear' | 'ExponentialBackoff';

export type DependencyCondition = 'OnSuccess' | 'OnFailure' | 'Always';

export type WorkflowStatus = 'Running' | 'Completed' | 'Failed' | 'Cancelled';

export type AiCategory =
  | 'Timeout'
  | 'ValidationError'
  | 'DependencyFailure'
  | 'ResourceExhaustion'
  | 'CodeDefect'
  | 'Unknown';

export type AiConfidence = 'Low' | 'Medium' | 'High';

export type LogLevel = 'Debug' | 'Info' | 'Warn' | 'Error';

// ===========================
// API RESPONSE ENVELOPE
// ===========================

export interface ApiResponse<T> {
  data: T;
  meta?: PaginationMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

export interface PaginationMeta {
  cursor?: string;
  hasMore: boolean;
  total?: number;
}

// ===========================
// AUTH
// ===========================

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

// ===========================
// ORGANIZATIONS
// ===========================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
}

export interface OrganizationMember {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  joinedAt: string;
  user: { id: string; name: string; email: string };
}

// ===========================
// PROJECTS
// ===========================

export interface Project {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  createdAt: string;
  deletedAt?: string;
}

export interface ProjectApiKey {
  id: string;
  projectId: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  lastUsedAt?: string;
  revokedAt?: string;
  createdAt: string;
  // keyValue only returned on creation
  keyValue?: string;
}

// ===========================
// QUEUES
// ===========================

export interface Queue {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  priority: number;
  concurrencyLimit: number;
  isPaused: boolean;
  maxQueueSize?: number;
  shardCount: number;
  retryPolicyId?: string;
  version: number;
  createdAt: string;
  deletedAt?: string;
}

export interface QueueStats {
  queueId: string;
  date: string;
  enqueuedCount: number;
  completedCount: number;
  failedCount: number;
  avgDurationMs?: number;
  backlogSize: number;
}

export interface RetryPolicy {
  id: string;
  name: string;
  strategy: RetryStrategy;
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  jitter: boolean;
}

// ===========================
// JOBS
// ===========================

export interface Job {
  id: string;
  queueId: string;
  projectId: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  runAt: string;
  cronExpression?: string;
  isRecurring: boolean;
  attemptCount: number;
  maxAttempts?: number;
  idempotencyKey?: string;
  batchId?: string;
  shardKey: number;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobDto {
  queueId: string;
  type: string;
  payload?: Record<string, unknown>;
  priority?: number;
  runAt?: string;            // ISO datetime for delayed jobs
  cronExpression?: string;   // for recurring jobs
  maxAttempts?: number;
  retryPolicyId?: string;
  idempotencyKey?: string;
}

export interface JobExecution {
  id: string;
  jobId: string;
  attemptNumber: number;
  workerId?: string;
  status: ExecutionStatus;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  errorMessage?: string;
  errorStack?: string;
  result?: unknown;
}

export interface JobLog {
  id: string;
  jobExecutionId: string;
  timestamp: string;
  level: LogLevel;
  message: string;
}

export interface DeadLetterJob {
  id: string;
  originalJobId: string;
  queueId: string;
  jobType: string;
  payloadSnapshot: Record<string, unknown>;
  failureReason: string;
  attemptCount: number;
  movedAt: string;
  resolved: boolean;
  resolvedAt?: string;
  resolutionAction?: string;
}

// ===========================
// WORKERS
// ===========================

export interface Worker {
  id: string;
  hostname: string;
  pid: number;
  version: string;
  status: WorkerStatus;
  maxConcurrency: number;
  currentLoad: number;
  startedAt: string;
  lastHeartbeatAt: string;
}

export interface WorkerHeartbeat {
  id: string;
  workerId: string;
  timestamp: string;
  cpuUsage?: number;
  memoryUsage?: number;
  activeJobCount: number;
}

// ===========================
// WORKFLOWS
// ===========================

export interface Workflow {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  createdAt: string;
  nodes?: WorkflowNode[];
  edges?: WorkflowEdge[];
}

export interface WorkflowNode {
  id: string;
  workflowId: string;
  nodeKey: string;
  jobTemplate: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  workflowId: string;
  upstreamNodeKey: string;
  downstreamNodeKey: string;
  condition: DependencyCondition;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  startedAt: string;
  completedAt?: string;
  triggeredBy?: string;
  jobs: WorkflowRunJob[];
}

export interface WorkflowRunJob {
  id: string;
  workflowRunId: string;
  nodeKey: string;
  jobId?: string;
  status: JobStatus;
}

// ===========================
// AI SUMMARIES
// ===========================

export interface JobAiSummary {
  id: string;
  jobId: string;
  executionId: string;
  summaryText: string;
  category: AiCategory;
  confidence: AiConfidence;
  suggestedFix?: string;
  modelUsed: string;
  createdAt: string;
}

// ===========================
// WEBSOCKET EVENTS
// ===========================

export type WsEvent =
  | { event: 'job.created'; data: { jobId: string; queueId: string; status: JobStatus; timestamp: string } }
  | { event: 'job.claimed'; data: { jobId: string; workerId: string; timestamp: string } }
  | { event: 'job.started'; data: { jobId: string; workerId: string; timestamp: string } }
  | { event: 'job.completed'; data: { jobId: string; durationMs: number; attemptNumber: number; timestamp: string } }
  | { event: 'job.failed'; data: { jobId: string; error: string; attemptNumber: number; timestamp: string } }
  | { event: 'job.dead_lettered'; data: { jobId: string; failureReason: string; attemptCount: number; timestamp: string } }
  | { event: 'queue.stats_updated'; data: { queueId: string; throughput: number; errorRate: number; backlogSize: number } }
  | { event: 'worker.online'; data: { workerId: string; hostname: string; activeJobCount: number } }
  | { event: 'worker.offline'; data: { workerId: string; hostname: string } }
  | { event: 'workflow.run_updated'; data: { workflowRunId: string; nodeStatuses: Record<string, JobStatus> } };
