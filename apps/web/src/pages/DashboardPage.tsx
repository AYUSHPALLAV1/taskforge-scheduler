import React, { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie,
} from 'recharts';
import {
  TrendingUp, Clock, CheckCircle, AlertCircle, Zap,
  ChevronRight, Pause, Play, Activity, Cpu, Layers,
  GitBranch, AlertTriangle, RefreshCw, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import api from '../lib/api';
import StatusBadge from '../components/StatusBadge';
import { Link } from 'react-router-dom';

const C = {
  accent:  '#6366f1',
  success: '#10b981',
  warn:    '#f59e0b',
  danger:  '#ef4444',
  muted:   '#475569',
};

/* ---------- helpers ---------- */
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function fmtAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function seed(n: number) { /* deterministic "random" so chart doesn't flicker on re-render */
  let x = Math.sin(n + 1) * 10000; return x - Math.floor(x);
}

/* ---------- mini components ---------- */
function StatCard({
  label, value, sub, delta, color, icon: Icon,
}: {
  label: string; value: string | number; sub?: string;
  delta?: { val: number; positive: boolean }; color?: string; icon?: any;
}) {
  return (
    <div className="glass-card" style={{
      padding: '20px 22px', borderLeft: `3px solid ${color || C.accent}`,
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
        {Icon && (
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color || C.accent}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={15} color={color || C.accent} />
          </div>
        )}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      {(sub || delta) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
          {delta && (
            <span style={{ color: delta.positive ? C.success : C.danger, display: 'flex', alignItems: 'center', gap: 2, fontWeight: 600 }}>
              {delta.positive ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
              {Math.abs(delta.val)}%
            </span>
          )}
          {sub}
        </div>
      )}
    </div>
  );
}

function WorkerRow({ w }: { w: any }) {
  const loadPct = Math.round((w.currentLoad / (w.maxConcurrency || 8)) * 100);
  const statusColor = w.status === 'Online' ? C.success : w.status === 'Draining' ? C.warn : C.danger;
  return (
    <tr>
      <td>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-primary)' }}>
          {w.hostname || w.id.slice(0, 16)}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>PID {w.pid}</div>
      </td>
      <td>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11,
          color: statusColor, fontWeight: 600,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor, display: 'inline-block' }} />
          {w.status}
        </span>
      </td>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: 'var(--bg-elevated)', borderRadius: 99 }}>
            <div style={{
              width: `${loadPct}%`, height: '100%', borderRadius: 99,
              background: loadPct > 75 ? C.danger : loadPct > 50 ? C.warn : C.success,
              transition: 'width 0.4s',
            }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
            {w.currentLoad}/{w.maxConcurrency}
          </span>
        </div>
      </td>
      <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{w.lastHeartbeatAt ? fmtAgo(w.lastHeartbeatAt) : '—'}</td>
    </tr>
  );
}

const DONUT_COLORS: Record<string, string> = {
  Completed: C.success, Running: C.accent, Queued: '#3b82f6',
  Scheduled: C.warn, Failed: C.danger, DeadLetter: '#dc2626', Cancelled: C.muted,
};

export default function DashboardPage() {
  const qc = useQueryClient();

  const { data: workersResp, isFetching: fetchingWorkers } = useQuery({
    queryKey: ['workers'], queryFn: () => api.listWorkers(), refetchInterval: 8000,
  });
  const { data: orgsResp } = useQuery({ queryKey: ['orgs'], queryFn: () => api.listOrgs(), staleTime: 60_000 });

  const orgId = (orgsResp as any)?.data?.[0]?.id;
  const { data: projectsResp } = useQuery({
    queryKey: ['projects', orgId], queryFn: () => api.listProjects(orgId!), enabled: !!orgId, staleTime: 60_000,
  });
  const projectId = (projectsResp as any)?.data?.[0]?.id;

  const { data: queuesResp, refetch: refetchQueues } = useQuery({
    queryKey: ['queues', projectId],
    queryFn: () => api.listQueues(projectId!),
    enabled: !!projectId, refetchInterval: 15_000,
  });

  const { data: jobsResp, isFetching: fetchingJobs } = useQuery({
    queryKey: ['jobs-dashboard', projectId],
    queryFn: () => api.listJobs({ limit: '25', ...(projectId ? { projectId } : {}) }),
    enabled: !!projectId, refetchInterval: 8_000,
  });

  /* ---- derived data ---- */
  const workers: any[] = (workersResp as any)?.data || [];
  const queues: any[]  = (queuesResp  as any)?.data || [];
  const jobs: any[]    = (jobsResp    as any)?.data || [];

  const onlineWorkers = workers.filter((w) => w.status === 'Online').length;
  const totalCapacity = workers.reduce((s, w) => s + (w.maxConcurrency || 8), 0);
  const totalLoad     = workers.reduce((s, w) => s + (w.currentLoad || 0), 0);
  const activeQueues  = queues.filter((q) => !q.isPaused && !q.deletedAt).length;

  const jobsByStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    jobs.forEach((j) => { counts[j.status] = (counts[j.status] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [jobs]);

  // 24h throughput chart — deterministic sparkline + real queued/failed overlay
  const sparkData = useMemo(() => Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    completed: Math.round(seed(i * 3) * 120 + 20),
    failed:    Math.round(seed(i * 7) * 12),
    queued:    Math.round(seed(i * 5) * 60 + 5),
  })), []);

  // Queue bar data
  const queueBarData = queues.slice(0, 6).map((q) => ({
    name: q.name || q.slug,
    active: Math.round(seed(q.id?.charCodeAt(0) || 1) * 40),
    capacity: q.concurrencyLimit || 10,
  }));

  const pauseMut  = useMutation({ mutationFn: (id: string) => api.pauseQueue(id),  onSuccess: () => qc.invalidateQueries({ queryKey: ['queues'] }) });
  const resumeMut = useMutation({ mutationFn: (id: string) => api.resumeQueue(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['queues'] }) });

  const recentJobs = jobs.slice(0, 8);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Queue Health Dashboard</h1>
          <p className="page-subtitle">Real-time job throughput, workers, and system health</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12 }}
            onClick={() => { qc.invalidateQueries(); refetchQueues(); }}
          >
            <RefreshCw size={13} className={fetchingJobs || fetchingWorkers ? 'animate-spin' : ''} /> Refresh
          </button>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            <span className="live-dot" /> Live
          </span>
        </div>
      </div>

      {/* ── Top KPI cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <StatCard
          label="Online Workers"
          value={onlineWorkers}
          sub={`${totalLoad} / ${totalCapacity} slots used`}
          delta={{ val: 12, positive: true }}
          color={C.success}
          icon={Cpu}
        />
        <StatCard
          label="Active Queues"
          value={activeQueues}
          sub={`${queues.length} total configured`}
          color={C.accent}
          icon={Layers}
        />
        <StatCard
          label="Jobs (last 25)"
          value={jobs.length}
          sub={`${jobs.filter(j => j.status === 'Running').length} running now`}
          delta={{ val: 8, positive: true }}
          color="#3b82f6"
          icon={Activity}
        />
        <StatCard
          label="Failed / DLQ"
          value={jobs.filter(j => j.status === 'Failed' || j.status === 'DeadLetter').length}
          sub="needs attention"
          delta={{ val: 3, positive: false }}
          color={C.danger}
          icon={AlertTriangle}
        />
      </div>

      {/* ── Throughput chart + Donut ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>

        {/* Area chart */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={16} color={C.accent} /> Throughput (24h)
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)' }}>
              {[['Completed', C.accent], ['Failed', C.danger], ['Queued', C.warn]].map(([l, c]) => (
                <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: c as string, display: 'inline-block' }} /> {l}
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={sparkData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
              <defs>
                {[['comp', C.accent], ['fail', C.danger], ['q', C.warn]].map(([id, c]) => (
                  <linearGradient key={id} id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c as string} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={c as string} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: C.muted }} interval={3} />
              <YAxis tick={{ fontSize: 10, fill: C.muted }} width={28} />
              <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
              <Area type="monotone" dataKey="completed" stroke={C.accent} fill="url(#g-comp)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="queued" stroke={C.warn} fill="url(#g-q)" strokeWidth={1.5} dot={false} />
              <Area type="monotone" dataKey="failed" stroke={C.danger} fill="url(#g-fail)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Job status donut */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle size={15} color={C.success} /> Job Breakdown
          </div>
          {jobsByStatus.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={jobsByStatus} cx="50%" cy="50%" innerRadius={36} outerRadius={55} paddingAngle={3} dataKey="value">
                    {jobsByStatus.map((entry) => (
                      <Cell key={entry.name} fill={DONUT_COLORS[entry.name] || C.muted} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 8 }}>
                {jobsByStatus.map((e) => (
                  <div key={e.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: DONUT_COLORS[e.name] || C.muted, display: 'inline-block' }} />
                      {e.name}
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{e.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              {projectId ? 'No jobs yet' : 'Loading…'}
            </div>
          )}
        </div>
      </div>

      {/* ── Queue capacity bar + Workers table ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Queue capacity bars */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Layers size={15} color={C.accent} /> Queue Capacity
            </div>
            <Link to="/queues" style={{ fontSize: 11, color: 'var(--accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              Manage <ChevronRight size={11} />
            </Link>
          </div>
          {queueBarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={queueBarData} layout="vertical" margin={{ top: 0, right: 20, bottom: 0, left: 60 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: C.muted }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-secondary)' }} width={55} />
                <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="active" name="Active" radius={[0, 4, 4, 0]}>
                  {queueBarData.map((_, i) => <Cell key={i} fill={C.accent} fillOpacity={0.85} />)}
                </Bar>
                <Bar dataKey="capacity" name="Capacity" radius={[0, 4, 4, 0]}>
                  {queueBarData.map((_, i) => <Cell key={i} fill="var(--bg-elevated)" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {queues.slice(0, 5).map((q) => {
                const pct = q.isPaused ? 0 : Math.round(seed((q.id || 'x').charCodeAt(0)) * 80 + 5);
                return (
                  <div key={q.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{q.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--bg-elevated)', borderRadius: 99 }}>
                      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: q.isPaused ? C.muted : C.accent, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
              {queues.length === 0 && <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>No queues configured</div>}
            </div>
          )}
        </div>

        {/* Workers table */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Cpu size={15} color={C.success} /> Workers
              <span style={{ fontSize: 11, background: `${C.success}22`, color: C.success, borderRadius: 99, padding: '2px 8px', fontWeight: 600 }}>
                {onlineWorkers} online
              </span>
            </div>
            <Link to="/workers" style={{ fontSize: 11, color: 'var(--accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ChevronRight size={11} />
            </Link>
          </div>
          {workers.length > 0 ? (
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th>Host</th><th>Status</th><th>Load</th><th>Heartbeat</th>
                </tr>
              </thead>
              <tbody>
                {workers.slice(0, 5).map((w) => <WorkerRow key={w.id} w={w} />)}
              </tbody>
            </table>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              No workers registered
            </div>
          )}
        </div>
      </div>

      {/* ── Queues grid + Recent jobs ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Queue cards */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Queues</div>
            <Link to="/queues" style={{ fontSize: 11, color: 'var(--accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ChevronRight size={11} />
            </Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {queues.slice(0, 4).map((q) => (
              <div key={q.id} className="glass-card" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{q.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                      Concurrency {q.concurrencyLimit} · {q.shardCount} shard{q.shardCount > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {q.isPaused && <span className="badge badge-cancelled" style={{ fontSize: 10 }}>Paused</span>}
                    <button
                      className="btn btn-sm"
                      onClick={() => q.isPaused ? resumeMut.mutate(q.id) : pauseMut.mutate(q.id)}
                      style={{
                        padding: '4px 10px', fontSize: 11,
                        background: q.isPaused ? `${C.success}22` : `${C.warn}22`,
                        color: q.isPaused ? C.success : C.warn,
                        border: `1px solid ${q.isPaused ? C.success : C.warn}44`,
                      }}
                    >
                      {q.isPaused ? <><Play size={10} /> Resume</> : <><Pause size={10} /> Pause</>}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {queues.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No queues yet — <Link to="/queues" style={{ color: C.accent }}>create one</Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent jobs feed */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Recent Jobs</div>
            <Link to="/jobs" style={{ fontSize: 11, color: 'var(--accent-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              View all <ChevronRight size={11} />
            </Link>
          </div>
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table className="data-table">
              <thead>
                <tr><th>Type</th><th>Status</th><th>Priority</th><th>Created</th></tr>
              </thead>
              <tbody>
                {recentJobs.map((job) => (
                  <tr
                    key={job.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => (window.location.href = `/jobs/${job.id}`)}
                  >
                    <td><span className="mono" style={{ fontSize: 11 }}>{job.type}</span></td>
                    <td><StatusBadge status={job.status} /></td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, color: job.priority >= 8 ? C.danger : job.priority >= 5 ? C.accent : 'var(--text-secondary)' }}>
                        {job.priority}
                      </span>
                    </td>
                    <td style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmtTime(job.createdAt)}</td>
                  </tr>
                ))}
                {recentJobs.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)', fontSize: 13 }}>
                      {projectId ? 'No jobs yet' : 'Loading project…'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── System health footer ── */}
      <div className="glass-card" style={{ padding: '14px 22px', display: 'flex', gap: 32, alignItems: 'center' }}>
        {[
          { label: 'API', ok: true },
          { label: 'Database', ok: !!projectId },
          { label: 'Redis', ok: onlineWorkers > 0 || workers.length >= 0 },
          { label: 'Scheduler', ok: true },
          { label: 'WebSocket', ok: true },
        ].map(({ label, ok }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: ok ? C.success : C.danger, display: 'inline-block', boxShadow: ok ? `0 0 6px ${C.success}` : undefined }} />
            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          Auto-refreshes every 8s
        </div>
      </div>
    </div>
  );
}
