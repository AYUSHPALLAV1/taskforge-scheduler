// Prisma enum mirrors — used until Prisma client is generated from migrations
// These match the values in packages/db/prisma/schema.prisma exactly

export enum JobStatus {
  Scheduled = 'Scheduled',
  Queued = 'Queued',
  Claimed = 'Claimed',
  Running = 'Running',
  Completed = 'Completed',
  Failed = 'Failed',
  DeadLetter = 'DeadLetter',
  Cancelled = 'Cancelled',
}

export enum ExecutionStatus {
  Running = 'Running',
  Completed = 'Completed',
  Failed = 'Failed',
  TimedOut = 'TimedOut',
}

export enum WorkerStatus {
  Online = 'Online',
  Draining = 'Draining',
  Offline = 'Offline',
}

export enum OrgRole {
  Owner = 'Owner',
  Admin = 'Admin',
  Member = 'Member',
  Viewer = 'Viewer',
}

export enum ProjectRole {
  Lead = 'Lead',
  Developer = 'Developer',
  Observer = 'Observer',
}

export enum DependencyCondition {
  OnSuccess = 'OnSuccess',
  OnFailure = 'OnFailure',
  Always = 'Always',
}

export enum RetryStrategy {
  Fixed = 'Fixed',
  Linear = 'Linear',
  ExponentialBackoff = 'ExponentialBackoff',
}

export enum AiCategory {
  Timeout = 'Timeout',
  ValidationError = 'ValidationError',
  DependencyFailure = 'DependencyFailure',
  ResourceExhaustion = 'ResourceExhaustion',
  CodeDefect = 'CodeDefect',
  Unknown = 'Unknown',
}

export enum ConfidenceLevel {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
}

export enum LogLevel {
  Debug = 'Debug',
  Info = 'Info',
  Warn = 'Warn',
  Error = 'Error',
}
