# TaskForge — Live Deployment Guide

## Architecture Overview

```
Frontend (Vercel)  →  API (Render)  →  Neon PostgreSQL
                                   →  Upstash Redis
```

---

## Connectivity Status

| Service | Status | Notes |
|---------|--------|-------|
| **Neon PostgreSQL** | HEALTHY | Pooled via PgBouncer, 44 demo jobs seeded |
| **Upstash Redis** | HEALTHY | v8.2.0, PING/write/read all verified |
| **NestJS API** | Running | http://localhost:3000 |
| **Vite Frontend** | Running | http://localhost:5173 |

---

## Demo Data Loaded

- **Login:** `demo@taskforge.dev` / `Demo1234!`
- **Org:** TaskForge Demo Corp → **Project:** Main Platform
- **Queues (5):** Default, Email, Analytics, Critical, Background
- **Jobs (44):** Across all statuses — Completed, Running, Queued, Scheduled, Failed, DeadLetter, Cancelled
- **Workflow:** Nightly Reporting Pipeline (6-node DAG: Extract → Enrich → Validate → Aggregate → Notify)

---

## DEPLOY TO PRODUCTION (Free Tier)

### STEP 1 — Push to GitHub

```powershell
cd "C:\Users\ayush\Downloads\project 1\taskforge"
git add -A
git commit -m "feat: production-ready TaskForge with rich dashboard data"
git push origin main
```

---

### STEP 2 — Deploy API to Render.com

1. Go to https://render.com — sign in with GitHub
2. Click **New** → **Web Service** → Connect your TaskForge repo
3. Configure:

```
Name:          taskforge-api
Region:        Oregon (US West)
Branch:        main
Runtime:       Node
Build Command: pnpm install --frozen-lockfile && pnpm --filter @taskforge/api run build
Start Command: node apps/api/dist/main.js
Instance:      Free
```

4. Add ALL these Environment Variables on Render (copy your real values from `.env`):

```
DATABASE_URL=<your Neon direct connection URL from .env>

DATABASE_URL_POOLED=<your Neon pooled URL from .env>&connection_limit=10&pool_timeout=20

REDIS_URL=<your Upstash Redis URL from .env>

GEMINI_API_KEY=<your Gemini API key from .env>
GEMINI_MODEL=gemini-1.5-flash
GEMINI_RPM_LIMIT=10
GEMINI_RPD_LIMIT=1000

JWT_SECRET=<generate a real 64+ char random string>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://YOUR-VERCEL-URL.vercel.app   <- UPDATE AFTER STEP 3

WORKER_CONCURRENCY=4
WORKER_POLL_MIN_MS=3000
WORKER_POLL_MAX_MS=15000
WORKER_HEARTBEAT_MS=15000
WORKER_GRACE_PERIOD_MS=30000
SCHEDULER_TICK_MS=5000
SCHEDULER_LEADER_LOCK_TTL_MS=15000
```

5. Click **Create Web Service** — wait ~3-5 mins for first deploy
6. Copy your API URL: `https://taskforge-api.onrender.com`

---

### STEP 3 — Deploy Frontend to Vercel.com

1. Go to https://vercel.com — sign in with GitHub
2. Click **Add New** → **Project** → Import your TaskForge repo
3. Configure:

```
Framework Preset:  Vite
Root Directory:    apps/web
Build Command:     pnpm run build
Output Directory:  dist
Install Command:   pnpm install
```

4. Add Environment Variables:

```
VITE_API_URL = https://taskforge-api.onrender.com
VITE_WS_URL  = https://taskforge-api.onrender.com
```

5. Click **Deploy** — takes ~1 minute
6. Copy your frontend URL: `https://taskforge-xyz.vercel.app`

---

### STEP 4 — Update CORS on Render

1. Go to Render → taskforge-api → **Environment**
2. Change `CORS_ORIGIN` to your Vercel URL: `https://taskforge-xyz.vercel.app`
3. Render auto-redeploys in ~2 minutes

---

### STEP 5 — Verify Production

Test your live API:
```bash
curl https://taskforge-api.onrender.com/api/v1/healthz
# Should return: {"status":"ok","timestamp":"..."}
```

Open your frontend at your Vercel URL and login with:
```
Email:    demo@taskforge.dev
Password: Demo1234!
```

---

## Render render.yaml (Auto-deploy config)

Create `render.yaml` in repo root for one-click deploys:

```yaml
services:
  - type: web
    name: taskforge-api
    runtime: node
    buildCommand: pnpm install --frozen-lockfile && pnpm --filter @taskforge/api run build
    startCommand: node apps/api/dist/main.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: "3000"
      - key: DATABASE_URL_POOLED
        sync: false
      - key: REDIS_URL
        sync: false
      - key: JWT_SECRET
        generateValue: true
```

---

## Production Checklist

- [ ] `git push origin main` — code pushed
- [ ] Render API deployed and healthy (`/api/v1/healthz` returns 200)
- [ ] Vercel frontend deployed and loads login page
- [ ] `CORS_ORIGIN` on Render updated to Vercel URL
- [ ] Can login and see the dashboard with jobs data
- [ ] JWT_SECRET changed to a real random string in Render env vars
- [ ] Swagger docs accessible at `/api/docs`

---

## Local Dev Quick Reference

```powershell
# Start everything (run each in separate terminal)
pnpm --filter @taskforge/api run start     # API on :3000
pnpm --filter @taskforge/web run dev       # Frontend on :5173

# Database operations
pnpm --filter @taskforge/db run seed           # Re-seed demo data
pnpm --filter @taskforge/db run migrate:deploy  # Apply migrations

# URLs
http://localhost:5173          # Frontend
http://localhost:3000/api/v1/healthz   # API health
http://localhost:3000/api/docs         # Swagger docs
```
