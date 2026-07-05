import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, RefreshCw, Filter, ChevronRight, ChevronLeft } from 'lucide-react';
import api from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import { useUiStore } from '../store';

const STATUSES = ['', 'Queued', 'Scheduled', 'Running', 'Completed', 'Failed', 'DeadLetter', 'Cancelled'];

export default function JobsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cursor, setCursor] = useState<string | undefined>();
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ queueId: '', type: 'send-email', payload: '{}', priority: '5' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { selectedProjectId } = useUiStore();

  const params: Record<string, string> = { limit: '50' };
  if (statusFilter) params.status = statusFilter;
  if (cursor) params.cursor = cursor;
  if (selectedProjectId) params.projectId = selectedProjectId;

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['jobs', params],
    queryFn: () => api.listJobs(params),
    refetchInterval: 10000,
    enabled: !!selectedProjectId,
  });

  const jobs: any[] = (data as any)?.data || [];
  const meta: any = (data as any)?.meta || {};

  const { data: queuesAny } = useQuery({ queryKey: ['all-queues', selectedProjectId], queryFn: () => api.listQueues(selectedProjectId!), enabled: !!selectedProjectId });

  const createMutation = useMutation({
    mutationFn: (d: any) => api.createJob({ ...d, projectId: selectedProjectId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['jobs'] }); setShowCreate(false); },
  });


  const filtered = jobs.filter((j) =>
    !search ||
    j.type.includes(search) ||
    j.id.includes(search) ||
    j.status.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Job Explorer</h1>
          <p className="page-subtitle">Browse, filter, and manage all background jobs</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={13} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={13} /> New Job
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            className="input"
            placeholder="Search by type, ID, status…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUSES.map((s) => (
            <button
              key={s || 'all'}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setStatusFilter(s); setCursor(undefined); }}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Job ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Attempts</th>
                <th>Shard</th>
                <th>Created</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => (
                <tr
                  key={job.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                >
                  <td><span className="mono" style={{ fontSize: 11 }}>{job.id.slice(0, 12)}…</span></td>
                  <td><span className="mono" style={{ color: 'var(--accent-primary)' }}>{job.type}</span></td>
                  <td><StatusBadge status={job.status} /></td>
                  <td>
                    <span style={{
                      fontWeight: 600,
                      color: job.priority >= 8 ? '#f87171' : job.priority >= 5 ? '#f59e0b' : 'var(--text-secondary)',
                    }}>
                      {job.priority}
                    </span>
                  </td>
                  <td style={{ color: job.attemptCount > 1 ? '#f59e0b' : 'var(--text-secondary)' }}>
                    {job.attemptCount}{job.maxAttempts ? `/${job.maxAttempts}` : ''}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 11 }}>{job.shardKey}</td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {new Date(job.updatedAt).toLocaleString()}
                  </td>
                  <td><ChevronRight size={14} color="var(--text-muted)" /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    {isFetching ? 'Loading…' : 'No jobs found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Showing {filtered.length} jobs
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => setCursor(undefined)} disabled={!cursor}>
              <ChevronLeft size={12} /> First
            </button>
            <button
              className="btn btn-sm btn-secondary"
              disabled={!meta.hasMore}
              onClick={() => setCursor(meta.cursor)}
            >
              Next <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Create Job Modal */}
      {showCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div className="glass-card animate-fade-in" style={{ padding: 28, width: '100%', maxWidth: 480 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Create Job</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Job Type</label>
                <input className="input" value={createForm.type} onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))} placeholder="send-email" />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Queue ID</label>
                <input className="input" value={createForm.queueId} onChange={(e) => setCreateForm((f) => ({ ...f, queueId: e.target.value }))} placeholder="clq123..." />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Priority (1–10)</label>
                <input className="input" type="number" min="1" max="10" value={createForm.priority} onChange={(e) => setCreateForm((f) => ({ ...f, priority: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 5 }}>Payload (JSON)</label>
                <textarea
                  className="input"
                  rows={4}
                  value={createForm.payload}
                  onChange={(e) => setCreateForm((f) => ({ ...f, payload: e.target.value }))}
                  style={{ resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={createMutation.isPending}
                onClick={() => {
                  let payload = {};
                  try { payload = JSON.parse(createForm.payload); } catch { }
                  createMutation.mutate({ ...createForm, priority: parseInt(createForm.priority), payload });
                }}
              >
                {createMutation.isPending ? 'Creating…' : 'Create Job'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
