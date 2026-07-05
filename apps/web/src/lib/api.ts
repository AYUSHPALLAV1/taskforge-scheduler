// TaskForge API Client — typed wrapper around fetch
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function getToken(): string | null {
  return localStorage.getItem('tf_access_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${BASE_URL}/api/v1${path}`, { ...options, headers, credentials: 'include' });

  if (res.status === 401) {
    // Try to refresh
    const refreshed = await fetch(`${BASE_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (refreshed.ok) {
      const data = await refreshed.json();
      localStorage.setItem('tf_access_token', data.data.accessToken);
      // Retry original request
      return request<T>(path, options);
    }
    localStorage.removeItem('tf_access_token');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Auth
  signup: (data: any) => request('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: any) => request<{ data: { accessToken: string; user: any } }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request<{ data: any }>('/auth/me'),

  // Organizations
  listOrgs: () => request<{ data: any[] }>('/orgs'),
  createOrg: (data: any) => request('/orgs', { method: 'POST', body: JSON.stringify(data) }),
  getOrg: (id: string) => request<{ data: any }>(`/orgs/${id}`),
  listMembers: (orgId: string) => request<{ data: any[] }>(`/orgs/${orgId}/members`),
  inviteMember: (orgId: string, data: any) => request(`/orgs/${orgId}/members`, { method: 'POST', body: JSON.stringify(data) }),
  removeMember: (orgId: string, userId: string) => request(`/orgs/${orgId}/members/${userId}`, { method: 'DELETE' }),

  // Projects
  listProjects: (orgId: string) => request<{ data: any[] }>(`/orgs/${orgId}/projects`),
  createProject: (orgId: string, data: any) => request(`/orgs/${orgId}/projects`, { method: 'POST', body: JSON.stringify(data) }),

  // Queues
  listQueues: (projectId: string) => request<{ data: any[] }>(`/projects/${projectId}/queues`),
  createQueue: (projectId: string, data: any) => request(`/projects/${projectId}/queues`, { method: 'POST', body: JSON.stringify(data) }),
  getQueue: (projectId: string, queueId: string) => request<{ data: any }>(`/projects/${projectId}/queues/${queueId}`),
  getQueueStats: (projectId: string, queueId: string) => request<{ data: any }>(`/projects/${projectId}/queues/${queueId}/stats`),
  pauseQueue: (queueId: string) => request(`/queues/${queueId}/pause`, { method: 'POST' }),
  resumeQueue: (queueId: string) => request(`/queues/${queueId}/resume`, { method: 'POST' }),

  // Jobs
  listJobs: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ data: any[]; meta: any }>(`/jobs?${qs}`);
  },
  createJob: (data: any, idempotencyKey?: string) =>
    request('/jobs', { method: 'POST', body: JSON.stringify(data), headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} }),
  batchCreate: (data: any) => request('/jobs/batch', { method: 'POST', body: JSON.stringify(data) }),
  getJob: (id: string) => request<{ data: any }>(`/jobs/${id}`),
  cancelJob: (id: string) => request(`/jobs/${id}/cancel`, { method: 'POST' }),
  retryJob: (id: string) => request(`/jobs/${id}/retry`, { method: 'POST' }),
  getExecutions: (jobId: string) => request<{ data: any[] }>(`/jobs/${jobId}/executions`),
  getLogs: (executionId: string, cursor?: string) => request<{ data: any[]; meta: any }>(`/jobs/executions/${executionId}/logs${cursor ? `?cursor=${cursor}` : ''}`),
  getAiSummary: (jobId: string) => request<{ data: any }>(`/jobs/${jobId}/ai-summary`),
  regenerateAiSummary: (jobId: string) => request(`/jobs/${jobId}/ai-summary/regenerate`, { method: 'POST' }),

  // Workers
  listWorkers: () => request<{ data: any[] }>('/workers'),
  workerStatus: () => request<{ data: any }>('/workers/status'),

  // Workflows
  listWorkflows: (projectId: string) => request<{ data: any[] }>(`/projects/${projectId}/workflows`),
  createWorkflow: (projectId: string, data: any) => request(`/projects/${projectId}/workflows`, { method: 'POST', body: JSON.stringify(data) }),
  getWorkflow: (projectId: string, wfId: string) => request<{ data: any }>(`/projects/${projectId}/workflows/${wfId}`),
  startWorkflowRun: (projectId: string, wfId: string) => request(`/projects/${projectId}/workflows/${wfId}/runs`, { method: 'POST' }),
  getWorkflowRun: (projectId: string, wfId: string, runId: string) => request<{ data: any }>(`/projects/${projectId}/workflows/${wfId}/runs/${runId}`),

  // DLQ
  listDlq: (queueId?: string) => request<{ data: any[] }>(`/dlq${queueId ? `?queueId=${queueId}` : ''}`),
  requeueDlq: (id: string) => request(`/dlq/${id}/requeue`, { method: 'POST' }),
  discardDlq: (id: string) => request(`/dlq/${id}/discard`, { method: 'POST' }),
};

export default api;
