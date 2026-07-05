import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, GitBranch, CheckCircle, AlertCircle, Clock, Circle } from 'lucide-react';
import api from '../lib/api';
import StatusBadge from '../components/StatusBadge';

const NODE_STATUS_COLOR: Record<string, string> = {
  Queued: '#60a5fa', Running: '#34d399', Completed: '#10b981',
  Failed: '#f87171', Cancelled: '#64748b', default: '#475569',
};

function WorkflowDag({ nodes, edges, runJobs }: { nodes: any[]; edges: any[]; runJobs: any[] }) {
  // Simple visual DAG representation (columns by topological depth)
  const depths = new Map<string, number>();
  const allNodes = nodes.map((n) => n.nodeKey);

  const getDepth = (key: string, visited = new Set<string>()): number => {
    if (depths.has(key)) return depths.get(key)!;
    if (visited.has(key)) return 0;
    visited.add(key);
    const upstreams = edges.filter((e) => e.downstreamNodeKey === key).map((e) => e.upstreamNodeKey);
    const depth = upstreams.length === 0 ? 0 : Math.max(...upstreams.map((u) => getDepth(u, visited) + 1));
    depths.set(key, depth);
    return depth;
  };

  allNodes.forEach((k) => getDepth(k));
  const maxDepth = Math.max(...Array.from(depths.values()), 0);

  const columns: string[][] = Array.from({ length: maxDepth + 1 }, () => []);
  allNodes.forEach((k) => columns[depths.get(k) || 0].push(k));

  return (
    <div style={{ display: 'flex', gap: 40, alignItems: 'center', overflowX: 'auto', padding: '16px 0', minHeight: 160 }}>
      {columns.map((col, ci) => (
        <div key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {col.map((nodeKey) => {
            const runJob = runJobs.find((r) => r.nodeKey === nodeKey);
            const status = runJob?.status;
            const color = NODE_STATUS_COLOR[status] || NODE_STATUS_COLOR.default;
            return (
              <div key={nodeKey} style={{
                position: 'relative',
                background: 'var(--bg-elevated)',
                border: `1.5px solid ${color}`,
                borderRadius: 10, padding: '10px 16px', minWidth: 120,
                boxShadow: `0 0 10px ${color}22`,
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{nodeKey}</div>
                {status && <StatusBadge status={status} />}
                {!status && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>pending</span>}
                {/* Connector arrow to right */}
                {ci < columns.length - 1 && (
                  <div style={{ position: 'absolute', right: -24, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 16 }}>→</div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function WorkflowsPage() {
  const [selectedWf, setSelectedWf] = useState<any>(null);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const queryClient = useQueryClient();

  const { data: orgs } = useQuery({ queryKey: ['orgs'], queryFn: () => api.listOrgs() });
  const orgId = (orgs as any)?.data?.[0]?.id;
  const { data: projects } = useQuery({ queryKey: ['projects', orgId], queryFn: () => api.listProjects(orgId), enabled: !!orgId });
  const projectId = (projects as any)?.data?.[0]?.id;

  const { data: wfResp } = useQuery({
    queryKey: ['workflows', projectId], queryFn: () => api.listWorkflows(projectId!), enabled: !!projectId,
  });
  const workflows: any[] = (wfResp as any)?.data || [];

  const { data: wfDetail } = useQuery({
    queryKey: ['workflow', selectedWf?.id],
    queryFn: () => api.getWorkflow(projectId!, selectedWf!.id),
    enabled: !!selectedWf && !!projectId,
    refetchInterval: 5000,
  });
  const detail: any = (wfDetail as any)?.data;

  const { data: runDetail } = useQuery({
    queryKey: ['workflow-run', selectedRun?.id],
    queryFn: () => api.getWorkflowRun(projectId!, selectedWf!.id, selectedRun!.id),
    enabled: !!selectedRun && !!selectedWf && !!projectId,
    refetchInterval: 3000,
  });
  const run: any = (runDetail as any)?.data;

  const startRunMutation = useMutation({
    mutationFn: () => api.startWorkflowRun(projectId!, selectedWf!.id),
    onSuccess: (data: any) => {
      setSelectedRun(data.data);
      queryClient.invalidateQueries({ queryKey: ['workflow', selectedWf?.id] });
    },
  });

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Workflow Builder</h1>
          <p className="page-subtitle">Define DAG pipelines and monitor live runs</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20 }}>
        {/* Workflow list */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Workflows</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className="glass-card"
                style={{ padding: 14, cursor: 'pointer', borderColor: selectedWf?.id === wf.id ? 'var(--accent-primary)' : 'var(--border)' }}
                onClick={() => { setSelectedWf(wf); setSelectedRun(null); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <GitBranch size={13} color="var(--accent-primary)" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{wf.name}</span>
                </div>
                {wf.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{wf.description}</div>}
              </div>
            ))}
            {workflows.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 20, textAlign: 'center' }}>No workflows yet</div>
            )}
          </div>
        </div>

        {/* Workflow detail */}
        <div>
          {detail ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{detail.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{detail.nodes?.length || 0} nodes · {detail.deps?.length || 0} edges</div>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => startRunMutation.mutate()}
                  disabled={startRunMutation.isPending}
                >
                  <Play size={13} /> {startRunMutation.isPending ? 'Starting…' : 'Start Run'}
                </button>
              </div>

              {/* DAG Visualisation */}
              <div className="glass-card" style={{ padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>DAG Structure</div>
                <WorkflowDag
                  nodes={detail.nodes || []}
                  edges={detail.deps || []}
                  runJobs={run?.jobs || []}
                />
              </div>

              {/* Run history */}
              {detail.runs?.length > 0 && (
                <div className="glass-card" style={{ padding: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase' }}>Recent Runs</div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Run ID</th>
                        <th>Status</th>
                        <th>Triggered By</th>
                        <th>Started</th>
                        <th>Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.runs.map((r: any) => (
                        <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedRun(r)}>
                          <td><span className="mono">{r.id.slice(0, 12)}…</span></td>
                          <td><StatusBadge status={r.status} /></td>
                          <td style={{ color: 'var(--text-muted)' }}>{r.triggeredBy || 'manual'}</td>
                          <td style={{ fontSize: 11 }}>{new Date(r.startedAt).toLocaleString()}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {r.completedAt ? `${Math.round((new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)}s` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text-muted)', flexDirection: 'column', gap: 12, border: '1px dashed var(--border)', borderRadius: 12 }}>
              <GitBranch size={32} color="var(--text-muted)" />
              <div style={{ fontSize: 14 }}>Select a workflow to view its DAG and runs</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
