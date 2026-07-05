import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, RefreshCw, XCircle, RotateCcw, Sparkles, Clock,
  CheckCircle, AlertCircle, ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import api from '../lib/api';
import StatusBadge from '../components/StatusBadge';

function Timeline({ executions }: { executions: any[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {executions.map((exec, i) => (
        <div key={exec.id} style={{ display: 'flex', gap: 16, position: 'relative' }}>
          {/* Connector line */}
          {i < executions.length - 1 && (
            <div style={{ position: 'absolute', left: 19, top: 32, bottom: -8, width: 2, background: 'var(--border)' }} />
          )}
          {/* Dot */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%', flexShrink: 0, zIndex: 1,
            background: exec.status === 'Completed' ? 'rgba(16,185,129,0.15)' : exec.status === 'Failed' ? 'rgba(239,68,68,0.15)' : 'rgba(99,102,241,0.15)',
            border: `2px solid ${exec.status === 'Completed' ? '#10b981' : exec.status === 'Failed' ? '#ef4444' : '#6366f1'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {exec.status === 'Completed' ? <CheckCircle size={16} color="#10b981" /> : exec.status === 'Failed' ? <AlertCircle size={16} color="#ef4444" /> : <Clock size={16} color="#6366f1" />}
          </div>

          {/* Content */}
          <div style={{ flex: 1, paddingBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Attempt #{exec.attemptNumber}</span>
              <StatusBadge status={exec.status} />
              {exec.durationMs && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{(exec.durationMs / 1000).toFixed(2)}s</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
              {new Date(exec.startedAt).toLocaleString()}
              {exec.finishedAt && ` → ${new Date(exec.finishedAt).toLocaleString()}`}
            </div>
            {exec.workerId && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Worker: <span className="mono">{exec.workerId}</span></div>
            )}
            {exec.errorMessage && (
              <div style={{
                marginTop: 8, background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 12px',
                fontSize: 12, color: '#f87171', fontFamily: 'var(--font-mono)',
              }}>
                {exec.errorMessage}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function LogTail({ executionId }: { executionId: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  const { isFetching, refetch } = useQuery({
    queryKey: ['logs', executionId, cursor],
    queryFn: async () => {
      const res: any = await api.getLogs(executionId, cursor);
      setLogs((prev) => {
        const existing = new Set(prev.map((l: any) => l.id));
        const newLogs = (res.data || []).filter((l: any) => !existing.has(l.id));
        return [...prev, ...newLogs];
      });
      setHasMore(res.meta?.hasMore || false);
      if (res.meta?.cursor) setCursor(res.meta.cursor);
      return res;
    },
    refetchInterval: 3000,
  });

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const levelColor: Record<string, string> = { Debug: '#475569', Info: '#94a3b8', Warn: '#f59e0b', Error: '#f87171' };

  return (
    <div className="log-container" ref={logRef}>
      {logs.map((log: any) => (
        <div key={log.id} className={`log-${log.level.toLowerCase()}`}>
          <span style={{ color: '#475569', marginRight: 8 }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
          <span style={{ color: levelColor[log.level] || '#94a3b8', marginRight: 8 }}>[{log.level.toUpperCase()}]</span>
          {log.message}
        </div>
      ))}
      {logs.length === 0 && (
        <div style={{ color: 'var(--text-muted)' }}>{isFetching ? 'Loading logs…' : 'No logs yet'}</div>
      )}
    </div>
  );
}

function AiPanel({ jobId }: { jobId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['ai-summary', jobId],
    queryFn: () => api.getAiSummary(jobId),
    retry: 1,
  });

  const regenerateMutation = useMutation({
    mutationFn: () => api.regenerateAiSummary(jobId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-summary', jobId] }),
  });

  const summary: any = (data as any)?.data;

  const confColor: Record<string, string> = { Low: '#f59e0b', Medium: '#6366f1', High: '#10b981' };

  return (
    <div className="glass-card" style={{ padding: 20, marginTop: 20, borderLeft: '2px solid var(--accent-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={15} color="var(--accent-primary)" />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>AI Failure Insight</span>
          {summary && (
            <span style={{ fontSize: 10, background: `rgba(${summary.confidence === 'High' ? '16,185,129' : summary.confidence === 'Medium' ? '99,102,241' : '245,158,11'},0.15)`, color: confColor[summary.confidence] || '#f59e0b', borderRadius: 99, padding: '2px 7px' }}>
              {summary.confidence} confidence
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {summary && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>via {summary.modelUsed}</span>
          )}
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => regenerateMutation.mutate()}
            disabled={regenerateMutation.isPending}
          >
            <RefreshCw size={11} className={regenerateMutation.isPending ? 'animate-spin' : ''} />
            Regenerate
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[40, 60, 40].map((w, i) => <div key={i} className="skeleton" style={{ height: 14, width: `${w}%` }} />)}
        </div>
      )}

      {summary && !isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Root Cause</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{summary.summaryText}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-failed">{summary.category}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 8px', background: 'var(--bg-elevated)', borderRadius: 99 }}>
              Fingerprint: {summary.errorFingerprint?.slice(0, 8)}
            </span>
          </div>
          {summary.suggestedFix && (
            <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#10b981', marginBottom: 4 }}>💡 SUGGESTED FIX</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{summary.suggestedFix}</div>
            </div>
          )}
        </div>
      )}

      {!summary && !isLoading && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          No AI summary yet. Summary is auto-generated when a job reaches max retry attempts.
        </div>
      )}
    </div>
  );
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showPayload, setShowPayload] = useState(false);

  const { data: jobResp, isLoading } = useQuery({
    queryKey: ['job', id],
    queryFn: () => api.getJob(id!),
    refetchInterval: 5000,
    enabled: !!id,
  });
  const job: any = (jobResp as any)?.data;

  const { data: execResp } = useQuery({
    queryKey: ['executions', id],
    queryFn: () => api.getExecutions(id!),
    enabled: !!id,
    refetchInterval: 5000,
  });
  const executions: any[] = (execResp as any)?.data || [];

  const cancelMutation = useMutation({
    mutationFn: () => api.cancelJob(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job', id] }),
  });
  const retryMutation = useMutation({
    mutationFn: () => api.retryJob(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job', id] }),
  });

  if (isLoading) {
    return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[80, 60, 100, 60].map((w, i) => <div key={i} className="skeleton" style={{ height: 20, width: `${w}%` }} />)}
    </div>;
  }

  if (!job) return <div style={{ color: 'var(--text-muted)' }}>Job not found</div>;

  const latestExecution = executions[0];
  const isTerminal = ['Completed', 'Failed', 'DeadLetter', 'Cancelled'].includes(job.status);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigate('/jobs')}>
          <ArrowLeft size={16} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className="page-title" style={{ fontSize: 18 }}>{job.type}</h1>
            <StatusBadge status={job.status} />
            {job.isRecurring && <span className="badge badge-scheduled">Recurring</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            <span className="mono">{job.id}</span> · Created {new Date(job.createdAt).toLocaleString()}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Queued', 'Scheduled', 'Claimed'].includes(job.status) && (
            <button className="btn btn-danger btn-sm" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
              <XCircle size={13} /> Cancel
            </button>
          )}
          {['Failed', 'Cancelled', 'DeadLetter'].includes(job.status) && (
            <button className="btn btn-secondary btn-sm" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
              <RotateCcw size={13} /> Retry
            </button>
          )}
        </div>
      </div>

      {/* Meta grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Priority', value: job.priority },
          { label: 'Attempts', value: `${job.attemptCount}/${job.maxAttempts || '∞'}` },
          { label: 'Shard', value: job.shardKey },
          { label: 'Queue', value: job.queueId?.slice(0, 10) + '…' },
          { label: 'Run At', value: new Date(job.runAt).toLocaleString() },
          { label: 'Idempotency Key', value: job.idempotencyKey || '—' },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all', fontFamily: 'var(--font-mono)' }}>{String(value)}</div>
          </div>
        ))}
      </div>

      {job.failureReason && (
        <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '14px 16px', marginBottom: 20, fontSize: 13, color: '#f87171', fontFamily: 'var(--font-mono)' }}>
          <span style={{ fontFamily: 'var(--font-sans)', color: '#f87171', fontWeight: 600 }}>Failure: </span>
          {job.failureReason}
        </div>
      )}

      {/* Payload toggle */}
      <div className="glass-card" style={{ marginBottom: 20 }}>
        <button
          style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}
          onClick={() => setShowPayload((v) => !v)}
        >
          Payload
          {showPayload ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {showPayload && (
          <div style={{ padding: '0 18px 18px' }}>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--bg-elevated)', borderRadius: 8, padding: 14 }}>
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {/* Execution timeline */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>Execution Timeline</div>
          {executions.length > 0 ? (
            <Timeline executions={executions} />
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No executions yet</div>
          )}
        </div>

        {/* Logs */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 14 }}>
            {latestExecution ? `Logs — Attempt #${latestExecution.attemptNumber}` : 'Logs'}
          </div>
          {latestExecution ? (
            <LogTail executionId={latestExecution.id} />
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No executions to show logs for</div>
          )}
        </div>
      </div>

      {/* AI Panel — shown for failed/dead-lettered jobs */}
      {(job.status === 'Failed' || job.status === 'DeadLetter' || job.aiSummary) && (
        <AiPanel jobId={job.id} />
      )}
    </div>
  );
}
