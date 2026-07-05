import React from 'react';
import type { JobStatus } from '@taskforge/shared-types';

const STATUS_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  Scheduled:  { label: 'Scheduled',   cls: 'badge-scheduled',  dot: '#f59e0b' },
  Queued:     { label: 'Queued',      cls: 'badge-queued',     dot: '#60a5fa' },
  Claimed:    { label: 'Claimed',     cls: 'badge-claimed',    dot: '#818cf8' },
  Running:    { label: 'Running',     cls: 'badge-running',    dot: '#34d399' },
  Completed:  { label: 'Completed',   cls: 'badge-completed',  dot: '#10b981' },
  Failed:     { label: 'Failed',      cls: 'badge-failed',     dot: '#f87171' },
  DeadLetter: { label: 'Dead Letter', cls: 'badge-deadletter', dot: '#ef4444' },
  Cancelled:  { label: 'Cancelled',   cls: 'badge-cancelled',  dot: '#64748b' },
};

interface StatusBadgeProps { status: string; }

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || { label: status, cls: 'badge-cancelled', dot: '#64748b' };
  return (
    <span className={`badge ${config.cls}`}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: config.dot, display: 'inline-block' }} />
      {config.label}
    </span>
  );
}
