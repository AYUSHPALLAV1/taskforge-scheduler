import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cpu, Activity, Clock, Wifi, WifiOff } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../lib/api';

function WorkerCard({ worker }: { worker: any }) {
  const isOnline = worker.status === 'Online';
  const isDraining = worker.status === 'Draining';
  const loadPct = worker.maxConcurrency > 0 ? Math.round((worker.currentLoad / worker.maxConcurrency) * 100) : 0;

  const timeSinceHb = Date.now() - new Date(worker.lastHeartbeatAt).getTime();
  const hbLabel = timeSinceHb < 15000 ? 'Just now' : `${Math.round(timeSinceHb / 1000)}s ago`;

  return (
    <div className="glass-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            {isOnline ? <Wifi size={14} color="#10b981" /> : isDraining ? <Activity size={14} color="#f59e0b" /> : <WifiOff size={14} color="#64748b" />}
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {worker.hostname}
            </span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>PID {worker.pid} · v{worker.version}</div>
        </div>
        <span className={`badge ${isOnline ? 'badge-running' : isDraining ? 'badge-scheduled' : 'badge-cancelled'}`}>
          {worker.status}
        </span>
      </div>

      {/* Load bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Load</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: loadPct > 80 ? '#f87171' : 'var(--text-secondary)' }}>
            {worker.currentLoad}/{worker.maxConcurrency} ({loadPct}%)
          </span>
        </div>
        <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            width: `${loadPct}%`,
            background: loadPct > 80 ? '#ef4444' : loadPct > 50 ? '#f59e0b' : '#10b981',
            transition: 'width 0.5s ease',
          }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={11} /> Heartbeat: {hbLabel}
        </span>
        <span>Started: {new Date(worker.startedAt).toLocaleTimeString()}</span>
      </div>
    </div>
  );
}

export default function WorkersPage() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workers'],
    queryFn: () => api.listWorkers(),
    refetchInterval: 10000,
  });
  const { data: statusResp } = useQuery({ queryKey: ['worker-status'], queryFn: () => api.workerStatus(), refetchInterval: 5000 });

  const workers: any[] = (data as any)?.data || [];
  const status: any = (statusResp as any)?.data;

  const online = workers.filter((w) => w.status === 'Online').length;
  const draining = workers.filter((w) => w.status === 'Draining').length;
  const offline = workers.filter((w) => w.status === 'Offline').length;
  const totalLoad = workers.reduce((a, w) => a + w.currentLoad, 0);
  const maxLoad = workers.reduce((a, w) => a + w.maxConcurrency, 0);

  // Generate mock heartbeat sparkline data
  const sparkData = Array.from({ length: 20 }, (_, i) => ({
    t: i, load: Math.floor(Math.random() * 6 + 1),
  }));

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Worker Fleet</h1>
          <p className="page-subtitle">Monitor all worker instances and their current load</p>
        </div>
        <button className="btn btn-secondary" onClick={() => refetch()}>
          <Activity size={13} /> Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card" style={{ borderTop: '2px solid #10b981' }}>
          <div className="stat-value" style={{ color: '#10b981' }}>{online}</div>
          <div className="stat-label">Online</div>
        </div>
        <div className="stat-card" style={{ borderTop: '2px solid #f59e0b' }}>
          <div className="stat-value" style={{ color: '#f59e0b' }}>{draining}</div>
          <div className="stat-label">Draining</div>
        </div>
        <div className="stat-card" style={{ borderTop: '2px solid #475569' }}>
          <div className="stat-value" style={{ color: 'var(--text-secondary)' }}>{offline}</div>
          <div className="stat-label">Offline</div>
        </div>
        <div className="stat-card" style={{ borderTop: '2px solid #6366f1' }}>
          <div className="stat-value">{totalLoad}<span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/{maxLoad}</span></div>
          <div className="stat-label">Total Load</div>
        </div>
      </div>

      {/* Current process worker status */}
      {status && (
        <div className="glass-card" style={{ padding: 20, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, borderLeft: '2px solid #6366f1' }}>
          <Cpu size={20} color="var(--accent-primary)" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>In-Process Worker (this instance)</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {status.activeJobs} active · {status.freeSlots} free slots · {status.isShuttingDown ? '⚠ Shutting down' : 'Running'}
            </div>
          </div>

          {/* Mini sparkline */}
          <div style={{ flex: 1 }}>
            <ResponsiveContainer width="100%" height={40}>
              <LineChart data={sparkData}>
                <Line type="monotone" dataKey="load" stroke="#6366f1" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Worker grid */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 140, borderRadius: 12 }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {workers.map((w) => <WorkerCard key={w.id} worker={w} />)}
          {workers.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--text-muted)', padding: 60, fontSize: 14 }}>
              No workers registered. Start the API server to see workers here.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
