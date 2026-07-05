import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layers, Plus, Pause, Play } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function QueuesPage() {
  const { data: orgs } = useQuery({ queryKey: ['orgs'], queryFn: () => api.listOrgs() });
  const orgId = (orgs as any)?.[0]?.id;
  const { data: projects } = useQuery({ queryKey: ['projects', orgId], queryFn: () => api.listProjects(orgId), enabled: !!orgId });
  const projectId = (projects as any)?.data?.[0]?.id;

  const { data: queuesResp, refetch } = useQuery({
    queryKey: ['queues', projectId], queryFn: () => api.listQueues(projectId!), enabled: !!projectId, refetchInterval: 15000,
  });
  const queues: any[] = (queuesResp as any)?.data || [];

  const handlePause = async (queueId: string) => { await api.pauseQueue(queueId); refetch(); };
  const handleResume = async (queueId: string) => { await api.resumeQueue(queueId); refetch(); };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Queues</h1>
          <p className="page-subtitle">Configure and monitor job queues</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {queues.map((q) => (
          <div key={q.id} className="glass-card" style={{ padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{q.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>/{q.slug}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {q.isPaused && <span className="badge badge-cancelled">Paused</span>}
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => q.isPaused ? handleResume(q.id) : handlePause(q.id)}
                >
                  {q.isPaused ? <Play size={11} /> : <Pause size={11} />}
                  {q.isPaused ? 'Resume' : 'Pause'}
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Priority', value: q.priority },
                { label: 'Concurrency', value: q.concurrencyLimit },
                { label: 'Shards', value: q.shardCount },
                { label: 'Max Size', value: q.maxQueueSize ?? '∞' },
                { label: 'Version', value: q.version },
                { label: 'Retry Policy', value: q.retryPolicyId ? 'Custom' : 'Default' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{String(value)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              ID: {q.id}
            </div>
          </div>
        ))}
        {queues.length === 0 && (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
            <Layers size={32} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }} />
            No queues yet. Create one from the API.
          </div>
        )}
      </div>
    </div>
  );
}
