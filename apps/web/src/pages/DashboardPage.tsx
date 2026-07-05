import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, Clock, CheckCircle, AlertCircle, Zap, ChevronRight, Pause, Play } from 'lucide-react';
import api from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import { Link } from 'react-router-dom';

const ACCENT = '#6366f1';
const SUCCESS = '#10b981';
const DANGER = '#ef4444';

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="stat-card" style={{ borderTop: `2px solid ${color || ACCENT}` }}>
      <div className="stat-value" style={{ color: color || 'var(--text-primary)' }}>{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function QueueCard({ queue, onPause, onResume }: { queue: any; onPause: () => void; onResume: () => void }) {
  const [toggling, setToggling] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try { queue.isPaused ? await onResume() : await onPause(); }
    finally { setToggling(false); }
  };

  return (
    <div className="glass-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{queue.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Priority {queue.priority} · {queue.shardCount} shard{queue.shardCount > 1 ? 's' : ''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {queue.isPaused && <span className="badge badge-cancelled" style={{ fontSize: 10 }}>Paused</span>}
          <button
            className={`btn btn-sm btn-icon ${toggling ? '' : ''}`}
            onClick={handleToggle}
            disabled={toggling}
            title={queue.isPaused ? 'Resume' : 'Pause'}
            style={{ background: queue.isPaused ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: queue.isPaused ? '#10b981' : '#f59e0b', border: '1px solid currentColor' }}
          >
            {queue.isPaused ? <Play size={12} /> : <Pause size={12} />}
          </button>
        </div>
      </div>

      {/* Mini stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { label: 'Concurrency', value: queue.concurrencyLimit },
          { label: 'Max Size', value: queue.maxQueueSize || '∞' },
          { label: 'Retry Policy', value: queue.retryPolicyId ? 'Custom' : 'Default' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: workers } = useQuery({ queryKey: ['workers'], queryFn: () => api.listWorkers(), refetchInterval: 15000 });
  const { data: orgs } = useQuery({ queryKey: ['orgs'], queryFn: () => api.listOrgs() });

  const orgId = (orgs as any)?.[0]?.id;
  const { data: projects } = useQuery({
    queryKey: ['projects', orgId], queryFn: () => api.listProjects(orgId), enabled: !!orgId,
  });
  const projectId = (projects as any)?.data?.[0]?.id;

  const { data: queuesResp, refetch: refetchQueues } = useQuery({
    queryKey: ['queues', projectId], queryFn: () => api.listQueues(projectId!), enabled: !!projectId, refetchInterval: 30000,
  });
  const queues: any[] = (queuesResp as any)?.data || [];

  const { data: recentJobsResp } = useQuery({
    queryKey: ['jobs', { limit: '10' }],
    queryFn: () => api.listJobs({ limit: '10' }),
    enabled: !!projectId,
    refetchInterval: 10000,
  });
  const recentJobs: any[] = (recentJobsResp as any)?.data || [];

  const workerList: any[] = (workers as any)?.data || [];
  const onlineWorkers = workerList.filter((w) => w.status === 'Online').length;
  const totalLoad = workerList.reduce((a, w) => a + (w.currentLoad || 0), 0);

  // Sparkline mock data based on hour
  const sparkData = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    completed: Math.floor(Math.random() * 80 + 20),
    failed: Math.floor(Math.random() * 8),
  }));

  const handlePause = async (queueId: string) => { await api.pauseQueue(queueId); refetchQueues(); };
  const handleResume = async (queueId: string) => { await api.resumeQueue(queueId); refetchQueues(); };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Queue Health Dashboard</h1>
          <p className="page-subtitle">Real-time job throughput and system health</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="live-dot" />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Live</span>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: 28 }}>
        <StatCard label="Online Workers" value={onlineWorkers} sub={`${totalLoad} active jobs`} color={SUCCESS} />
        <StatCard label="Active Queues" value={queues.filter((q) => !q.isPaused && !q.deletedAt).length} color={ACCENT} />
        <StatCard label="Recent Jobs" value={recentJobs.length} sub="last 10 fetched" />
        <StatCard
          label="Failed (recent)"
          value={recentJobs.filter((j) => j.status === 'Failed' || j.status === 'DeadLetter').length}
          color={DANGER}
        />
      </div>

      {/* Throughput chart */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} color={ACCENT} /> Throughput (24h)
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Completed vs Failed</span>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={sparkData}>
            <defs>
              <linearGradient id="grad-complete" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={ACCENT} stopOpacity={0.3} />
                <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad-failed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={DANGER} stopOpacity={0.2} />
                <stop offset="95%" stopColor={DANGER} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#475569' }} interval={3} />
            <YAxis tick={{ fontSize: 10, fill: '#475569' }} width={30} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'var(--text-secondary)' }}
            />
            <Area type="monotone" dataKey="completed" stroke={ACCENT} fill="url(#grad-complete)" strokeWidth={1.5} dot={false} />
            <Area type="monotone" dataKey="failed" stroke={DANGER} fill="url(#grad-failed)" strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Queue cards */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Queues</div>
            <Link to="/queues" style={{ fontSize: 12, color: 'var(--accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {queues.slice(0, 4).map((q) => (
              <QueueCard key={q.id} queue={q} onPause={() => handlePause(q.id)} onResume={() => handleResume(q.id)} />
            ))}
            {queues.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No queues yet</div>
            )}
          </div>
        </div>

        {/* Recent jobs */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Recent Jobs</div>
            <Link to="/jobs" style={{ fontSize: 12, color: 'var(--accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => (
                  <tr key={job.id} style={{ cursor: 'pointer' }} onClick={() => window.location.href = `/jobs/${job.id}`}>
                    <td><span className="mono">{job.type}</span></td>
                    <td><StatusBadge status={job.status} /></td>
                    <td><span style={{ color: job.priority >= 8 ? '#f87171' : 'var(--text-secondary)' }}>{job.priority}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(job.createdAt).toLocaleTimeString()}</td>
                  </tr>
                ))}
                {recentJobs.length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>No jobs yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
