# Architecture — Self-Hostable SRE Dashboard

> Decided: 2026-03-24. See `docs/milestone-checklist.md` for implementation status.

## Vision

Transform the project from a "clone + edit .env + run CLI" developer tool into a **self-hostable SRE co-pilot** that any small engineering team (5–20 engineers) can run in one command and configure through a web UI.

**End-user experience:**
```bash
curl -O https://raw.githubusercontent.com/rutvij26/incident-orchestration-agent/main/docker-compose.yml
docker-compose up
# Open http://localhost:3000 → complete setup wizard → monitoring starts
```

No `.env` editing. No cloning. No building.

---

## Monorepo Structure

```
agentic/
  docker-compose.yml          # Production: references published Docker Hub images
  docker-compose.dev.yml      # Development: build: overrides for contributors
  .env.bootstrap              # Only 3 vars: POSTGRES_URL, TEMPORAL_ADDRESS, ENCRYPTION_KEY
  CLAUDE.md

  packages/
    shared/                   # @agentic/shared — types + Zod schemas used by both agent + dashboard
      src/
        types/incident.ts     # Incident, IncidentSummary, LogEvent
        types/config.ts       # ConfigRecord, config group enums
        schemas/config.ts     # Zod schema (single source of truth)
        constants/severity.ts
        constants/defaults.ts
        index.ts

    agent/                    # @agentic/agent — Temporal worker (minimal changes to existing code)
      src/
        lib/
          config.ts           # Thin wrapper — delegates to configLoader.ts, same getConfig() API
          configLoader.ts     # NEW: dual-mode loader (DB poll or env fallback) + AES-256-GCM decrypt
        memory/
          postgres.ts         # + agent_config, workflow_runs, schedule_config tables
        scheduler.ts          # NEW: Temporal Schedule CRUD (create, pause, trigger, status)
        worker.ts             # + initialise configLoader on boot

  apps/
    dashboard/                # @agentic/dashboard — Next.js 14 App Router + shadcn/ui
      Dockerfile              # standalone output, multi-stage build
      next.config.js          # output: 'standalone'
      src/app/
        page.tsx              # redirect → /incidents
        setup/page.tsx        # First-run wizard
        incidents/
          page.tsx            # Live incident feed (SSE)
          [id]/page.tsx       # Incident detail
        autofix/page.tsx      # Auto-fix attempt history
        settings/
          general/page.tsx    # Log source, escalation policy
          integrations/page.tsx  # API keys (masked), GitHub config, test buttons
          autofix/page.tsx    # Auto-fix mode, thresholds, sandbox settings
          rag/page.tsx        # Embedding model, chunk size, similarity
          advanced/page.tsx   # Temporal address (read-only), OTEL endpoint
        api/
          config/route.ts             # GET/PUT all config
          config/[group]/route.ts     # GET/PUT by group
          config/validate/route.ts    # POST Zod dry-run
          incidents/route.ts          # GET paginated list
          incidents/[id]/route.ts     # GET single incident
          incidents/feed/route.ts     # GET SSE stream
          autofix/route.ts            # GET paginated history
          workflow/trigger/route.ts   # POST trigger immediate scan
          workflow/schedule/route.ts  # GET/PUT schedule settings
          workflow/status/route.ts    # GET agent health
          health/route.ts
      src/lib/
        db.ts                 # Postgres client (same DB as agent)
        config-db.ts          # Config CRUD + encrypt/decrypt
        temporal-client.ts    # Temporal client for schedule management
        sse.ts                # SSE response helper

    demo-services/            # Existing — unchanged, Docker Compose profile: demo
```

---

## Docker Compose Services

| Service | Image | Port | Notes |
|---|---|---|---|
| `dashboard` | `rutvij26/agentic-dashboard:latest` | 3000 | New |
| `agent` | `rutvij26/agentic-agent:latest` | — | Modified bootstrap |
| `agentic-postgres` | `pgvector/pgvector:pg16` | 5432 | Existing |
| `temporal` | custom | 7233 | Existing |
| `temporal-postgres` | `postgres:12` | — | Existing |
| `temporal-ui` | `temporalio/ui` | 8080 | Existing |
| `loki` | `grafana/loki:3.0.0` | 3100 | Existing |
| `promtail` | `grafana/promtail` | — | Existing |
| `otel-collector` | `otel/opentelemetry-collector-contrib` | 4318 | Existing |
| `grafana` | `grafana/grafana` | **3001** | Moved from 3000 |
| `demo-services` | `./apps/demo-services` | 4000 | `--profile demo` |

**Grafana moves to 3001** so the dashboard takes 3000.

**Two compose files:**
- `docker-compose.yml` — uses published images (`image: rutvij26/...`). What end users download.
- `docker-compose.dev.yml` — overrides with `build:` contexts. For contributors.

Contributors run: `docker-compose -f docker-compose.yml -f docker-compose.dev.yml up`

---

## Database Schema

### New tables

```sql
-- Config store: replaces .env for all non-bootstrap settings
CREATE TABLE agent_config (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,           -- AES-256-GCM encrypted if sensitive=true
  config_group TEXT NOT NULL,           -- 'general'|'integrations'|'autofix'|'rag'|'advanced'
  sensitive    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-run audit log
CREATE TABLE workflow_runs (
  id              TEXT PRIMARY KEY,     -- Temporal workflow ID
  status          TEXT NOT NULL,        -- 'running'|'completed'|'failed'
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  incidents_found INTEGER DEFAULT 0,
  issues_created  INTEGER DEFAULT 0,
  error_message   TEXT,
  trigger         TEXT NOT NULL DEFAULT 'schedule'  -- 'schedule'|'manual'
);

-- Scheduling config managed via dashboard
CREATE TABLE schedule_config (
  id               TEXT PRIMARY KEY DEFAULT 'default',
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  interval_minutes INTEGER NOT NULL DEFAULT 15,
  lookback_minutes INTEGER NOT NULL DEFAULT 15,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Existing table enhancements

```sql
ALTER TABLE incident_memory
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS issue_url TEXT,
  ADD COLUMN IF NOT EXISTS pr_url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS workflow_run_id TEXT;

ALTER TABLE auto_fix_attempts
  ADD COLUMN IF NOT EXISTS pr_url TEXT,
  ADD COLUMN IF NOT EXISTS tests_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS plan_summary TEXT,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
```

### Config groups

| Group | Keys |
|---|---|
| `general` | `LOKI_URL`, `LOKI_QUERY`, `SOURCE_CONNECTORS`, `AUTO_ESCALATE_FROM` |
| `integrations` | `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `REPO_URL`, `GIT_USER_NAME`, `GIT_USER_EMAIL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `LLM_PROVIDER`, `LLM_CONNECTORS` |
| `autofix` | `AUTO_FIX_MODE`, `AUTO_FIX_SEVERITY`, `AUTO_FIX_BRANCH_PREFIX`, `AUTO_FIX_TEST_COMMAND`, `AUTO_FIX_INSTALL_COMMAND`, `AUTO_FIX_SANDBOX_IMAGE`, `AUTO_FIX_MIN_SCORE`, `AUTO_FIX_SKIP_AFTER_FAILURES`, `GITHUB_DEFAULT_BRANCH` |
| `rag` | `EMBEDDING_PROVIDER`, `EMBEDDING_CONNECTOR`, `EMBEDDING_MODEL`, `EMBEDDING_DIM`, `RAG_TOP_K`, `RAG_MIN_SCORE`, `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`, `RAG_REPO_PATH`, `RAG_REPO_SUBDIR`, `RAG_REPO_CACHE_DIR`, `RAG_REPO_REFRESH` |
| `advanced` | `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME` |

Bootstrap vars (never in DB, always from environment):
- `POSTGRES_URL`
- `TEMPORAL_ADDRESS`
- `ENCRYPTION_KEY` — AES-256-GCM key for encrypting sensitive config values

---

## Config Data Flow

```
Dashboard UI → PUT /api/config/integrations
  → Zod validate (packages/shared/src/schemas/config.ts)
  → AES-256-GCM encrypt sensitive fields
  → Upsert into agent_config table

Agent Worker (configLoader.ts) — polls every 30s
  → SELECT * FROM agent_config
  → Decrypt sensitive values
  → Merge: bootstrap env vars always override DB
  → Validate with shared Zod schema
  → Replace in-memory Config cache

getConfig() API is unchanged — all existing activity/workflow callers unaffected
```

**Dual-mode:** `CONFIG_SOURCE=env` preserves legacy `.env` behavior for CI and power users.

**Staleness:** Config changes propagate to the worker within 30 seconds. UI shows: _"Changes take up to 30 seconds to take effect."_

---

## Real-Time Incidents: SSE

`GET /api/incidents/feed` — Server-Sent Events:
- Server polls `incident_memory WHERE created_at > $lastSeen` every 5 seconds
- Pushes new incident rows as SSE events
- Client: React `EventSource` hook appends to list in real-time

Chosen over WebSockets (overkill, bidirectional not needed) and client polling (wasteful).

---

## Temporal Scheduling

**`packages/agent/src/scheduler.ts`** exposes:
- `createOrUpdateSchedule(opts)` — creates/updates a native Temporal Schedule
- `pauseSchedule()` / `unpauseSchedule()`
- `triggerNow()` — fires one-off workflow immediately
- `getScheduleStatus()` — last run, next run, worker connectivity

Dashboard controls call these via API routes. Settings persist to `schedule_config` table.

**First-run flow:**
1. `docker-compose up` — all services start
2. Worker boots in "waiting" state (registers task queue, no schedule yet)
3. User completes setup wizard → config written to `agent_config`
4. Worker detects config on next 30s poll → creates Temporal Schedule
5. Agent starts scanning on the configured interval

---

## Docker Image Publishing

**Published to Docker Hub:** `rutvij26/agentic-agent` and `rutvij26/agentic-dashboard`

**Tags:** `latest` (every push to main), `v1.0.0` + `v1` (on version tags)

**Architectures:** `linux/amd64` + `linux/arm64`

**CI pipeline (`.github/workflows/publish.yml`):**
1. Run `npm test` — gate on green
2. `docker buildx build --platform linux/amd64,linux/arm64`
3. Push to Docker Hub
4. Required secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`

---

## What Does NOT Change

The entire existing agent core is untouched:

- `src/workflows/incidentWorkflow.ts`
- `src/activities/incidentActivities.ts`
- `src/connectors/` — all connectors
- `src/autofix/autoFix.ts`
- `src/rag/`
- `apps/demo-services/`

The only changes to the agent are:
1. `config.ts` delegates to `configLoader.ts` (same `getConfig()` signature)
2. `worker.ts` initialises the config loader on boot
3. `memory/postgres.ts` adds 3 new tables + column additions to existing tables

---

## MCPs Installed (restart Claude Code to activate)

```bash
claude mcp add shadcn "npx -y @AurimarL/shadcnui-mcp@latest"
claude mcp add postgres "npx -y @modelcontextprotocol/server-postgres" -- "postgresql://agentic:agentic@localhost:5432/agentic"
claude mcp add context7 "npx -y @upstash/context7-mcp@latest"
```

---

## Implementation Order (Phase by Phase)

| Phase | Milestone | Key deliverable |
|---|---|---|
| 1 | M6 | `@agentic/shared` package + DB-backed config loader |
| 2 | M7 | Dashboard scaffold + setup wizard + settings UI |
| 3 | M8 | Live incident feed (SSE) |
| 4 | M9 | Workflow controls + Temporal scheduling |
| 5 | M10 | Auto-fix history dashboard |
| 6 | M11 | Docker Hub publishing + GitHub Actions CI |
