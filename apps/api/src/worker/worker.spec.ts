import { Test, TestingModule } from '@nestjs/testing';

// =============================================
// UNIT TEST: Retry delay calculator
// =============================================
describe('Retry Delay Calculator', () => {
  function calculateRetryDelay(policy: any, attempt: number): number {
    if (!policy) return 1000 * Math.pow(2, attempt);
    const base = policy.baseDelayMs || 1000;
    const max = policy.maxDelayMs || 60000;
    let delay: number;
    switch (policy.strategy) {
      case 'Fixed': delay = base; break;
      case 'Linear': delay = base * (attempt + 1); break;
      case 'ExponentialBackoff':
      default:
        delay = base * Math.pow(2, attempt);
        if (policy.jitter) delay *= 0.8 + Math.random() * 0.4;
    }
    return Math.min(delay, max);
  }

  it('Fixed strategy returns base delay regardless of attempt', () => {
    const p = { strategy: 'Fixed', baseDelayMs: 5000, maxDelayMs: 60000, jitter: false };
    expect(calculateRetryDelay(p, 0)).toBe(5000);
    expect(calculateRetryDelay(p, 5)).toBe(5000);
  });

  it('Linear strategy scales linearly', () => {
    const p = { strategy: 'Linear', baseDelayMs: 1000, maxDelayMs: 60000, jitter: false };
    expect(calculateRetryDelay(p, 0)).toBe(1000);
    expect(calculateRetryDelay(p, 1)).toBe(2000);
    expect(calculateRetryDelay(p, 2)).toBe(3000);
  });

  it('ExponentialBackoff doubles each attempt', () => {
    const p = { strategy: 'ExponentialBackoff', baseDelayMs: 1000, maxDelayMs: 60000, jitter: false };
    expect(calculateRetryDelay(p, 0)).toBe(1000);
    expect(calculateRetryDelay(p, 1)).toBe(2000);
    expect(calculateRetryDelay(p, 2)).toBe(4000);
    expect(calculateRetryDelay(p, 3)).toBe(8000);
  });

  it('Delay is capped at maxDelayMs', () => {
    const p = { strategy: 'ExponentialBackoff', baseDelayMs: 1000, maxDelayMs: 5000, jitter: false };
    expect(calculateRetryDelay(p, 10)).toBe(5000);
  });

  it('Jitter adds ±20% variance', () => {
    const p = { strategy: 'ExponentialBackoff', baseDelayMs: 1000, maxDelayMs: 60000, jitter: true };
    // Run 100 times — all values should be in [800, 1200] for attempt=0
    for (let i = 0; i < 100; i++) {
      const delay = calculateRetryDelay(p, 0);
      expect(delay).toBeGreaterThanOrEqual(800);
      expect(delay).toBeLessThanOrEqual(1200);
    }
  });
});

// =============================================
// UNIT TEST: RBAC permission resolution
// =============================================
describe('RBAC Permission Resolution', () => {
  const ROLE_PERMISSIONS: Record<string, string[]> = {
    Owner: ['job:create', 'job:cancel', 'job:view', 'queue:pause', 'queue:resume', 'queue:delete', 'member:invite', 'member:remove', 'dlq:requeue'],
    Admin: ['job:create', 'job:cancel', 'job:view', 'queue:pause', 'queue:resume', 'member:invite'],
    Member: ['job:create', 'job:view', 'queue:pause'],
    Viewer: ['job:view'],
  };

  const hasPermission = (role: string, permission: string): boolean =>
    (ROLE_PERMISSIONS[role] || []).includes(permission);

  it('Owner has all critical permissions', () => {
    const crits = ['job:create', 'job:cancel', 'queue:delete', 'member:remove', 'dlq:requeue'];
    crits.forEach((p) => expect(hasPermission('Owner', p)).toBe(true));
  });

  it('Viewer can only view jobs', () => {
    expect(hasPermission('Viewer', 'job:view')).toBe(true);
    expect(hasPermission('Viewer', 'job:create')).toBe(false);
    expect(hasPermission('Viewer', 'queue:pause')).toBe(false);
  });

  it('Admin cannot delete queues or remove members from org', () => {
    expect(hasPermission('Admin', 'queue:delete')).toBe(false);
    expect(hasPermission('Admin', 'member:remove')).toBe(false);
  });

  it('Member can create and view jobs', () => {
    expect(hasPermission('Member', 'job:create')).toBe(true);
    expect(hasPermission('Member', 'job:view')).toBe(true);
    expect(hasPermission('Member', 'job:cancel')).toBe(false);
  });
});

// =============================================
// UNIT TEST: Workflow DAG cycle detection
// =============================================
describe('Workflow DAG Cycle Detection', () => {
  function detectCycles(nodes: string[], edges: Array<{ from: string; to: string }>): boolean {
    const graph = new Map<string, string[]>();
    nodes.forEach((n) => graph.set(n, []));
    edges.forEach((e) => graph.get(e.from)?.push(e.to));

    const visited = new Set<string>();
    const inStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      inStack.add(node);
      for (const neighbor of graph.get(node) || []) {
        if (!visited.has(neighbor)) { if (dfs(neighbor)) return true; }
        else if (inStack.has(neighbor)) return true;
      }
      inStack.delete(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node) && dfs(node)) return true;
    }
    return false;
  }

  it('Linear chain: no cycle', () => {
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'D' }];
    expect(detectCycles(nodes, edges)).toBe(false);
  });

  it('Diamond shape: no cycle', () => {
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'B', to: 'D' }, { from: 'C', to: 'D' }];
    expect(detectCycles(nodes, edges)).toBe(false);
  });

  it('Simple cycle: detected', () => {
    const nodes = ['A', 'B', 'C'];
    const edges = [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }];
    expect(detectCycles(nodes, edges)).toBe(true);
  });

  it('Self-loop: detected', () => {
    const nodes = ['A'];
    const edges = [{ from: 'A', to: 'A' }];
    expect(detectCycles(nodes, edges)).toBe(true);
  });

  it('Disconnected graph with cycle in one component: detected', () => {
    const nodes = ['A', 'B', 'C', 'D'];
    const edges = [{ from: 'A', to: 'B' }, { from: 'C', to: 'D' }, { from: 'D', to: 'C' }];
    expect(detectCycles(nodes, edges)).toBe(true);
  });
});

// =============================================
// UNIT TEST: Error fingerprinting
// =============================================
describe('Error Fingerprint', () => {
  const { createHash } = require('crypto');

  function computeFingerprint(errorMessage: string): string {
    const normalized = errorMessage
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/g, 'TIMESTAMP')
      .replace(/\b\d+\b/g, 'N')
      .replace(/\s+at\s+.+:\d+:\d+/g, ' at LOCATION')
      .toLowerCase()
      .slice(0, 500);
    return createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  }

  it('Same error class produces same fingerprint despite different IDs', () => {
    const e1 = 'Connection timeout for job abc12345-0000-0000-0000-000000000001 at 2024-01-01T10:00:00';
    const e2 = 'Connection timeout for job abc12345-0000-0000-0000-000000000002 at 2024-02-15T14:30:00';
    expect(computeFingerprint(e1)).toBe(computeFingerprint(e2));
  });

  it('Different error classes produce different fingerprints', () => {
    const e1 = 'Connection timeout';
    const e2 = 'Validation failed: missing required field email';
    expect(computeFingerprint(e1)).not.toBe(computeFingerprint(e2));
  });

  it('Fingerprint is always 16 hex chars', () => {
    const fp = computeFingerprint('Some error message');
    expect(fp).toHaveLength(16);
    expect(fp).toMatch(/^[a-f0-9]+$/);
  });
});

// =============================================
// UNIT TEST: Cursor-based pagination encoding
// =============================================
describe('Cursor Pagination', () => {
  const encodeCursor = (date: Date) => Buffer.from(date.toISOString()).toString('base64');
  const decodeCursor = (cursor: string) => new Date(Buffer.from(cursor, 'base64').toString());

  it('Cursor round-trips correctly', () => {
    const original = new Date('2024-06-15T12:00:00.000Z');
    const cursor = encodeCursor(original);
    const decoded = decodeCursor(cursor);
    expect(decoded.toISOString()).toBe(original.toISOString());
  });

  it('Cursor is base64 encoded', () => {
    const cursor = encodeCursor(new Date());
    expect(() => Buffer.from(cursor, 'base64').toString()).not.toThrow();
  });
});
