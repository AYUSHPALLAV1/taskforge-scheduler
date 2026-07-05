import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RotateCcw, Trash2, Filter } from 'lucide-react';
import api from '../lib/api';

export default function DlqPage() {
  const [filter, setFilter] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['dlq'],
    queryFn: () => api.listDlq(),
    refetchInterval: 15000,
  });
  const jobs: any[] = (data as any)?.data || [];

  const requeueMutation = useMutation({
    mutationFn: (id: string) => api.requeueDlq(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dlq'] }),
  });

  const discardMutation = useMutation({
    mutationFn: (id: string) => api.discardDlq(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dlq'] }),
  });

  const filtered = jobs.filter(
    (j) => !filter || j.jobType.includes(filter) || j.failureReason?.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dead Letter Queue</h1>
          <p className="page-subtitle">Jobs that exhausted all retry attempts</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#f87171', background: 'rgba(239,68,68,0.1)', padding: '4px 10px', borderRadius: 99 }}>
            {jobs.length} unresolved
          </span>
          <button className="btn btn-secondary" onClick={() => refetch()}>Refresh</button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: 16 }}>
        <input
          className="input"
          placeholder="Filter by type or failure reason…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 360 }}
        />
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Job Type</th>
              <th>Failure Reason</th>
              <th>Attempts</th>
              <th>Moved to DLQ</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((job) => (
              <tr key={job.id}>
                <td>
                  <span className="mono" style={{ color: 'var(--accent-primary)' }}>{job.jobType}</span>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    Original: {job.originalJobId?.slice(0, 12)}…
                  </div>
                </td>
                <td>
                  <div style={{
                    maxWidth: 320, fontSize: 12,
                    color: '#f87171', fontFamily: 'var(--font-mono)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {job.failureReason}
                  </div>
                </td>
                <td>
                  <span style={{ color: '#f87171', fontWeight: 700 }}>{job.attemptCount}</span>
                </td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {new Date(job.movedAt).toLocaleString()}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-sm"
                      style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
                      onClick={() => requeueMutation.mutate(job.id)}
                      disabled={requeueMutation.isPending}
                      title="Requeue — create a new job from this snapshot"
                    >
                      <RotateCcw size={11} /> Requeue
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => discardMutation.mutate(job.id)}
                      disabled={discardMutation.isPending}
                      title="Permanently discard"
                    >
                      <Trash2 size={11} /> Discard
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 48 }}>
                  {isLoading ? 'Loading…' : (
                    <div style={{ color: 'var(--text-muted)' }}>
                      <AlertTriangle size={28} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.3 }} />
                      {filter ? 'No matching entries' : '🎉 Dead letter queue is empty'}
                    </div>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Payload previews for selected items */}
      {filtered.slice(0, 3).map((job) => (
        <details key={job.id} style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>
            Payload snapshot — {job.jobType} ({job.originalJobId?.slice(0, 12)}…)
          </summary>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginTop: 6, overflowX: 'auto', color: 'var(--text-secondary)' }}>
            {JSON.stringify(job.payloadSnapshot, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  );
}
