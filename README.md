# TaskForge — Distributed Job Scheduling Platform

> A production-grade, multi-tenant background job scheduler built on Node.js, NestJS, PostgreSQL, and Redis — with zero infrastructure cost using free-tier cloud services.

[![CI](https://github.com/yourusername/taskforge-scheduler/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/taskforge-scheduler/actions)

---

## ✨ Features

| Category | Feature |
|---|---|
| **Execution** | `SELECT FOR UPDATE SKIP LOCKED` — zero double-claims guaranteed |
| **Scheduling** | Immediate, delayed (runAt), cron-recurring, batch jobs |
| **Reliability** | Exponential/linear/fixed retry strategies with jitter |
| **Dead Letters** | Automatic DLQ promotion, requeue/discard via UI |
| **Workflows** | DAG pipelines with cycle detection, fan-in orchestration |
| **Rate Limiting** | Redis token-bucket Lua — ingress + per-queue execution |
| **Locking** | Redlock leader election for scheduler, workflow steps |
| **Sharding** | Per-queue shard_key partitioning for horizontal scale |
| **Real-time** | Socket.io + Redis adapter — WebSocket fan-out across instances |
| **RBAC** | 4-tier org roles (Owner/Admin/Member/Viewer), per-project overrides |
| **AI Summaries** | Gemini Flash failure analysis, fingerprinting, heuristic fallback |
| **Observability** | Queue health dashboard, worker fleet view, execution timeline, log tail |

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Render (Free Tier)                    │
│  ┌────────────┐  ┌───────────┐  ┌────────────────────┐  │
│  │  REST API  │  │ WebSocket │  │  Worker + Scheduler│  │
│  │  (NestJS)  │  │  Gateway  │  │  (in-process)      │  │
│  └─────┬──────┘  └─────┬─────┘  └──────────┬─────────┘  │
│        │               │                   │             │
└────────┼───────────────┼───────────────────┼─────────────┘
         │               │                   │
    ┌────▼─────┐   ┌─────▼─────┐   ┌────────▼─────────┐
    │   Neon   │   │  Upstash  │   │  Neon (SKIP LOCK) │
    │ Postgres │   │  Redis    │   │  LISTEN/NOTIFY    │
    └──────────┘   └───────────┘   └──────────────────┘
```

### Key Design Decisions
- **SKIP LOCKED** — Atomic job claiming with zero message broker overhead
- **In-process worker** — Free-tier viability; split to separate service at zero cost via env var
- **Outbox pattern** — Transactional events without distributed transactions
- **Redlock leader election** — Single scheduler tick among multiple instances
- **Redis permission cache** — 5s TTL per user×project, instant invalidation on role change

---

## 📁 Project Structure

```
taskforge/
├── apps/
│   ├── api/          # NestJS backend (REST + WebSocket + Worker + Scheduler)
│   └── web/          # React 18 + Vite frontend dashboard
├── packages/
│   ├── db/           # Prisma schema + migrations + seed
│   └── shared-types/ # Shared TypeScript types
├── .github/
│   └── workflows/ci.yml
├── docker-compose.yml
└── .env.example
```

---

## 🚀 Quick Start (Local)

### Prerequisites
- Node.js ≥ 22
- pnpm ≥ 9 (`npm install -g pnpm`)
- Docker (for local Postgres + Redis)

### 1. Clone and install
```bash
git clone https://github.com/yourusername/taskforge-scheduler
cd taskforge-scheduler
pnpm install
```

### 2. Start local infrastructure
```bash
docker compose up -d
```
This starts:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`

### 3. Configure environment
```bash
cp .env.example .env
# Edit .env — set DATABASE_URL_POOLED for local:
# DATABASE_URL=postgresql://taskforge:taskforge_dev@localhost:5432/taskforge
# DATABASE_URL_POOLED=postgresql://taskforge:taskforge_dev@localhost:5432/taskforge
# REDIS_URL=redis://localhost:6379
```

### 4. Run database migrations + seed
```bash
pnpm db:migrate
pnpm db:seed
```

### 5. Start dev servers
```bash
pnpm dev
```
- **API**: http://localhost:3000
- **Swagger UI**: http://localhost:3000/api/docs
- **Frontend**: http://localhost:5173

### 6. Login
Use the demo credentials seeded by `pnpm db:seed`:
- Email: `demo@taskforge.dev`
- Password: `Demo1234!`

---

## 🌐 Environment Variables

| Variable | Description | Required |
|---|---|---|
| `DATABASE_URL` | Direct Neon connection (migrations only) | ✅ |
| `DATABASE_URL_POOLED` | Pooled Neon connection (runtime queries) | ✅ |
| `REDIS_URL` | Upstash Redis TLS URL | ✅ |
| `JWT_SECRET` | ≥64 char random secret | ✅ |
| `GEMINI_API_KEY` | Google AI Studio key (free tier) | Optional |
| `WORKER_CONCURRENCY` | Max parallel jobs per instance (default: 8) | Optional |
| `CORS_ORIGIN` | Frontend URL for CORS | Optional |

---

## 📡 API Reference

Full interactive documentation: **http://localhost:3000/api/docs** (Swagger UI)

### Key Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/auth/signup` | Create account |
| `POST` | `/api/v1/auth/login` | Login → JWT + httpOnly cookie |
| `POST` | `/api/v1/auth/refresh` | Rotate refresh token |
| `GET`  | `/api/v1/auth/me` | Current user |
| `GET`  | `/api/v1/orgs` | List organizations |
| `POST` | `/api/v1/orgs` | Create organization |
| `GET`  | `/api/v1/orgs/:id/members` | List members |
| `POST` | `/api/v1/orgs/:id/members` | Invite member |
| `GET`  | `/api/v1/orgs/:orgId/projects` | List projects |
| `POST` | `/api/v1/projects/:id/queues` | Create queue |
| `POST` | `/api/v1/queues/:id/pause` | Pause queue |
| `POST` | `/api/v1/queues/:id/resume` | Resume queue |
| `POST` | `/api/v1/jobs` | Create job (immediate/delayed/recurring) |
| `POST` | `/api/v1/jobs/batch` | Create batch of jobs |
| `GET`  | `/api/v1/jobs?status=&queueId=&cursor=` | List jobs (cursor-paginated) |
| `POST` | `/api/v1/jobs/:id/cancel` | Cancel job |
| `POST` | `/api/v1/jobs/:id/retry` | Retry failed/cancelled job |
| `GET`  | `/api/v1/jobs/:id/executions` | Execution history |
| `GET`  | `/api/v1/jobs/executions/:id/logs` | Streaming logs |
| `GET`  | `/api/v1/jobs/:id/ai-summary` | AI failure summary |
| `POST` | `/api/v1/jobs/:id/ai-summary/regenerate` | Regenerate AI summary |
| `GET`  | `/api/v1/workers` | Worker fleet status |
| `POST` | `/api/v1/projects/:id/workflows` | Create workflow (DAG) |
| `POST` | `/api/v1/projects/:id/workflows/:id/runs` | Start workflow run |
| `GET`  | `/api/v1/dlq` | Dead letter queue |
| `POST` | `/api/v1/dlq/:id/requeue` | Requeue dead letter job |
| `POST` | `/api/v1/dlq/:id/discard` | Discard dead letter job |
| `GET`  | `/healthz` | Health probe (ping to keep Render warm) |

### Idempotent Job Creation
```http
POST /api/v1/jobs
Idempotency-Key: my-unique-key-123
Content-Type: application/json

{
  "queueId": "clq...",
  "type": "send-email",
  "payload": { "to": "user@example.com" },
  "priority": 7,
  "runAt": "2024-12-01T08:00:00Z"
}
```
Submitting the same `Idempotency-Key` twice returns the original job — no duplicate.

### If-Match Optimistic Concurrency (Queue Updates)
```http
PATCH /api/v1/projects/:id/queues/:queueId
If-Match: 3
Content-Type: application/json

{ "concurrencyLimit": 20 }
```
Returns `409 Conflict` if the queue version has changed since you read it.

---

## 🔌 WebSocket Events

Connect with your JWT token:
```js
const socket = io('http://localhost:3000', { auth: { token: accessToken } });

socket.on('job.created',    (data) => console.log('New job:', data.jobId));
socket.on('job.running',    (data) => console.log('Running:', data.jobId));
socket.on('job.completed',  (data) => console.log('Done:', data.jobId, data.durationMs + 'ms'));
socket.on('job.failed',     (data) => console.log('Failed:', data.jobId, data.error));
socket.on('queue.stats_updated', (data) => console.log('Queue:', data.queueId, data.backlogSize));
socket.on('worker.online',  (data) => console.log('Worker up:', data.hostname));
```

---

## 🧪 Running Tests

```bash
# Unit tests
pnpm --filter @taskforge/api run test

# Integration tests (requires DB + Redis)
pnpm --filter @taskforge/api run test:e2e

# All tests with coverage
pnpm --filter @taskforge/api run test --coverage
```

---

## 🚢 Free-Tier Deployment

### 1. Neon (PostgreSQL)
1. Sign up at [neon.tech](https://neon.tech)
2. Create a new project → copy **Direct** and **Pooled** connection strings
3. Set as `DATABASE_URL` and `DATABASE_URL_POOLED` in Render/Vercel env

### 2. Upstash (Redis)
1. Sign up at [upstash.com](https://upstash.com)
2. Create Redis database → copy the TLS URL
3. Set as `REDIS_URL`

### 3. Render (API)
1. Create new Web Service → connect your GitHub repo
2. Set Build Command: `pnpm install && pnpm --filter @taskforge/db run migrate && pnpm --filter @taskforge/api run build`
3. Set Start Command: `node apps/api/dist/main`
4. Add all env vars from `.env.example`
5. Set up UptimeRobot to ping `/healthz` every 5 minutes to prevent cold starts

### 4. Vercel (Frontend)
1. Import `apps/web` into Vercel
2. Set `VITE_API_URL` to your Render URL
3. Deploy

### 5. GitHub Secrets Required
```
DATABASE_URL
DATABASE_URL_POOLED
REDIS_URL
JWT_SECRET
GEMINI_API_KEY
RENDER_DEPLOY_HOOK_API
RENDER_API_KEY
VERCEL_TOKEN
```

---

## 🔬 Concurrency Guarantee

The critical worker claim query:

```sql
BEGIN;
SELECT id, queue_id, type, payload, priority
  FROM jobs
  WHERE status = 'Queued'
    AND run_at <= NOW()
    AND queue_id IN (SELECT id FROM queues WHERE is_paused = false)
  ORDER BY priority DESC, run_at ASC
  LIMIT 8                        -- = WORKER_CONCURRENCY
  FOR UPDATE SKIP LOCKED;        -- ← never blocks, never double-claims

UPDATE jobs
  SET status = 'Claimed', claimed_by_worker_id = $workerId
  WHERE id = ANY($claimedIds);
COMMIT;
```

**Result**: 20 workers claiming from 500 jobs simultaneously = exactly 500 unique claims, zero duplicates.

---

## 📜 License

MIT © TaskForge contributors
