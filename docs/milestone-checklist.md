## Milestone Checklist

Track implementation status for each prioritized milestone.

---

### Completed

#### RAG Isolation + Incremental Indexing

- [x] Add `repo_key` to `repo_embeddings` and scope retrieval by repo.
- [x] Re-embed only changed chunks (use `content_hash` or `git diff`).
- [x] Add minimum similarity threshold for retrieved context.

#### Auto-fix Decision Scoring

- [x] Add fixability score using LLM confidence + heuristics.
- [x] Persist auto-fix attempts/outcomes to prevent repeated bad fixes.

#### Prompt Architecture Hardening

- [x] Split prompt into plan → patch → verify loop.
- [x] Require file list + anchors from retrieved context for grounding.
- [x] Ground LLM with `git ls-files` to prevent path hallucinations in monorepos.
- [x] Feed full current file content to rewrite prompt to prevent anchor-check failures.
- [x] Scope RAG indexing to a subdirectory (`RAG_REPO_SUBDIR`) for monorepo setups.

---

### Milestone 4 — Connector Foundation + LLM / Embedding Connectors ✅

Establish the `connectors/` folder, multi-connector helpers, and migrate the already-partially-abstracted LLM and embedding providers.

- [x] Create `packages/agent/src/connectors/registry.ts` with resolver functions and helpers:
  - `fanOut()` — parallel fire-and-forget for notifications / issue creation.
  - `withFallback()` — ordered fallback chain for LLM calls.
  - `aggregateLogs()` — parallel query + deduplicate for source connectors.
- [x] Create `connectors/llm/interface.ts` (`LlmConnector`) and migrate providers:
  - `connectors/llm/openai.ts`, `connectors/llm/anthropic.ts`, `connectors/llm/gemini.ts`.
- [x] Create `connectors/embedding/interface.ts` (`EmbeddingConnector`) and migrate:
  - `connectors/embedding/openai.ts`, `connectors/embedding/gemini.ts`.
- [x] Replace internal dispatch logic in `lib/llm.ts` and `lib/embeddings.ts` with registry calls (`createLlmConnector`, `createEmbeddingConnector`).
- [x] Add `LLM_CONNECTORS` (comma-separated fallback chain) and `EMBEDDING_CONNECTOR` as optional overrides; `LLM_PROVIDER` / `EMBEDDING_PROVIDER` remain as backward-compatible defaults.
- [x] Create `connectors/source/interface.ts` stub (`SourceConnector`) ready for Milestone 5.

---

### Milestone 5 — Source Connectors ✅

- [x] Create `connectors/source/interface.ts` (`SourceConnector`).
- [x] Migrate `lib/loki.ts` → `connectors/source/loki.ts` (`LokiSourceConnector`). `lib/loki.ts` kept as a thin backward-compat wrapper.
- [x] Update `incidentActivities.fetchRecentLogs` to call `aggregateLogs(resolveSourceConnectors(config), ...)` instead of `queryLoki` directly.
- [x] Add `resolveSourceConnectors()` to `connectors/registry.ts`.
- [x] Add `SOURCE_CONNECTORS=loki` to config (default) and `.env.example`.
- [x] Fix `extractStreams` null-data bug (`typeof null === "object"` guard).
- [x] Add `logger.warn` for unknown source connector names.
- [x] 15 `LokiSourceConnector` tests + 6 `resolveSourceConnectors` registry tests; all 383 agent tests pass.

---

## 🔄 Pivot: Self-Hostable Product (Milestones 6–11)

> **Strategic decision (2026-03-24):** Rather than expanding connectors first, the priority is to make this a self-hostable product that any small engineering team can run in one command. A web dashboard replaces `.env` file configuration. Docker images are published to Docker Hub so teams don't need to clone or build anything.
>
> See `docs/architecture.md` for the full technical design.

---

### Milestone 6 — Shared Package + DB-Backed Config (Foundation) ✅

Everything else depends on this.

- [x] Create `packages/shared/` (`@agentic/shared`) with:
  - `src/types/incident.ts` — `Incident`, `IncidentSummary`, `LogEvent` (moved from `agent/lib/types.ts`)
  - `src/types/config.ts` — `ConfigRecord`, config group enums
  - `src/schemas/config.ts` — Zod schema (shared between agent + dashboard)
  - `src/constants/severity.ts`, `src/constants/defaults.ts`
  - `src/index.ts` — barrel export
- [x] Create `packages/agent/src/lib/configLoader.ts`:
  - Dual-mode: `CONFIG_SOURCE=db` (polls `agent_config` table every 30s) or `CONFIG_SOURCE=env` (legacy `.env`)
  - AES-256-GCM encryption/decryption for sensitive fields (`ENCRYPTION_KEY` bootstrap env var)
  - Same `getConfig()` API — all existing callers unaffected
- [x] Modify `packages/agent/src/lib/config.ts` to delegate to `configLoader.ts`
- [x] Modify `packages/agent/src/worker.ts` to initialise config loader on boot
- [x] Add new DB tables in `packages/agent/src/memory/postgres.ts`:
  - `agent_config` — key/value config store with group + sensitive flag
  - `workflow_runs` — per-run audit log (id, status, started_at, incidents_found, trigger)
  - `schedule_config` — scheduling settings (interval_minutes, enabled, lookback_minutes)
- [x] Add columns to existing tables:
  - `incident_memory`: `status`, `issue_url`, `pr_url`, `created_at`, `workflow_run_id`
  - `auto_fix_attempts`: `pr_url`, `tests_passed`, `plan_summary`, `duration_ms`
- [x] Update `packages/agent/src/lib/types.ts` to re-export from `@agentic/shared` (backward compat)
- [x] All 383 existing agent tests continue to pass

---

### Milestone 7 — Dashboard: Setup Wizard + Settings UI ✅

- [x] Scaffold `apps/dashboard/` Next.js 15 App Router project with shadcn/ui + Tailwind CSS, dark mode (zinc/indigo palette)
- [x] `apps/dashboard/Dockerfile` with `output: 'standalone'` (multi-stage, builds from monorepo root)
- [x] Root `docker-compose.yml` with all services:
  - Grafana moved to port 3001; dashboard takes port 3000
  - demo-services starts by default (no profile gate)
- [x] `docker-compose.dev.yml` with `build:` overrides for contributors
- [x] `.env.bootstrap` reduced to 3 vars: `POSTGRES_URL`, `TEMPORAL_ADDRESS`, `ENCRYPTION_KEY`
- [x] Setup wizard (`/setup`) — first-run detection (empty `agent_config`); 4-step wizard with per-step validation; collects LLM key, GitHub token, Loki URL, RAG repo; seeds `agent_config`
- [x] Settings pages (all groups configurable via UI):
  - `/settings/general` — log source, escalation policy
  - `/settings/integrations` — API keys (masked show/hide), GitHub config, test-connection buttons for Anthropic/OpenAI/Gemini/GitHub
  - `/settings/autofix` — auto-fix mode, severity threshold, branch prefix, test command
  - `/settings/rag` — repo URL, top K, min score, chunk size
  - `/settings/advanced` — Temporal address (read-only), OTEL endpoint
- [x] API routes: `GET/PUT /api/config`, `GET/PUT /api/config/[group]`, `POST /api/config/validate`
  - Config group validation — invalid `[group]` returns 400 (no silent accepts)
  - `writeConfig` wrapped in DB transaction (BEGIN/COMMIT/ROLLBACK)
- [x] Sidebar navigation — VSCode-style icon-only 48px bar with tooltips
- [x] Overview home page — stats bar, incidents feed, recent PRs, agent status widgets
  - Direct DB query layer (`src/lib/queries/`) — no self-HTTP anti-pattern
  - try/catch with zero-value fallbacks — one slow query never crashes the page
  - `OverviewRefresher` — auto-refreshes on tab focus (10 s debounce)
- [x] `RunAgentBtn` — full polling loop (3 s interval, `AbortController`), concurrent-run guard, Temporal deduplication (fixed workflowId → 409 on duplicate), `router.refresh()` on completion
- [x] `AgentStatus` — running spinner (`Loader2 animate-spin`), `aria-live="polite"`, hydration-safe `<ClientDate>`
- [x] `IncidentsFeed` + `RecentPRs` — `<ClientDate>` replaces `toLocaleString()` (fixes hydration mismatch); null `tests_passed` → "untested" badge
- [x] Settings `SettingsForm` — `res.ok` check; `toast.success` / `toast.error` via sonner
- [x] `TestConnectionBtn` — auto-resets to idle after 5 s
- [x] Temporal client singleton (`globalThis._temporalClient`) + try/finally in run route (no connection leaks)
- [x] `AUTO_FIX_MODE` Zod schema accepts legacy `"pr"` value via transform (DB backward compat)
- [x] Docker sandbox `network` field — install step uses `"bridge"` for npm registry; test step uses `"none"`
- [x] `agent_workspaces` named Docker volume so sandbox `--volumes-from` shares the workspace correctly
- [x] DB indexes added: `idx_incident_memory_status_created`, `idx_incident_memory_created`, `idx_auto_fix_created`, `idx_workflow_runs_started_at`
- [x] `next.config.ts` webpack `extensionAlias` — TypeScript ESM `.js` imports resolve to `.ts` files
- [x] 415 agent tests still pass; Next.js build passes cleanly

---

### Milestone 8 — Dashboard: Live Incident Feed ✅ (core complete)

- [x] Incident list page (`/incidents`) — severity badge, status filter tabs (All/Open/Acknowledged/Resolved), `<ClientDate>`, GitHub issue link, empty state CTA
- [x] Status pill — click to update incident status optimistically (`PATCH /api/incidents/[id]/status`)
- [x] Cursor-based pagination (composite `(created_at, id)` cursor)
- [x] `loading.tsx` + `error.tsx` for the route
- [x] API routes: `GET /api/incidents` (status filter + cursor), `PATCH /api/incidents/[id]/status`
- [ ] SSE stream: `GET /api/incidents/feed` — real-time push (deferred to future milestone)
- [ ] Incident detail page (`/incidents/[id]`) — full evidence, LLM summary, root cause (deferred)

---

### Milestone 9 — Dashboard: Workflow Controls + Temporal Scheduling (partial ✅)

- [x] Manual trigger button ("Run now") — `POST /api/agent/run`, polling loop, concurrent-run guard, 409 on duplicate
- [x] Agent status widget — last run time, status badge, running spinner, `<ClientDate>`
- [x] `GET /api/overview/agent` — latest workflow run row for live status polling
- [ ] Create `packages/agent/src/scheduler.ts` — `createOrUpdateSchedule`, `pauseSchedule`, `triggerNow`, `getScheduleStatus`
- [ ] Worker startup: read `schedule_config` from DB → ensure Temporal Schedule exists
- [ ] Schedule controls — set interval (5 / 15 / 30 / 60 min), pause/resume toggle
- [ ] Workflow run history table — status, trigger type, duration, incidents found
- [ ] API routes: `GET/PUT /api/workflow/schedule`, `GET /api/workflow/status`

---

### Milestone 10 — Dashboard: Auto-Fix History ✅

- [x] Auto-fix history page (`/autofix`) — timeline of all fix attempts
- [x] Per-attempt detail: incident title + severity badge, outcome badge (`pr_created`/`skipped`/`failed`), PR link (opens in new tab), test status (✓ / ✗ / –), `<ClientDate>`
- [x] Empty state: "No auto-fix attempts yet. Enable auto-fix in Settings → Auto-fix"
- [x] `loading.tsx` + `error.tsx` for the route
- [x] API route: `GET /api/autofix` (cursor-paginated, JOINs `auto_fix_attempts` + `incident_memory`)

---

### Milestone 11 — Docker Hub Publishing + GitHub Actions CI

- [ ] `packages/agent/Dockerfile` — multi-stage Node.js build
- [ ] `apps/dashboard/Dockerfile` — Next.js standalone output
- [ ] `.github/workflows/publish.yml`:
  - Triggers on push to `main` and on `v*` tags
  - Runs `npm test` first (gate on green tests)
  - Builds multi-arch images (`linux/amd64` + `linux/arm64`) with `docker buildx`
  - Pushes to Docker Hub: `rutvij26/agentic-agent` and `rutvij26/agentic-dashboard`
  - Tags: `latest` (main), `v1.0.0` + `v1` (on version tag)
- [ ] Root `docker-compose.yml` updated to reference published images (`image: rutvij26/agentic-agent:latest`)
- [ ] README rewritten: one-command install, Docker Hub badge, screenshot of dashboard
- [ ] GitHub Secrets configured: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`

---

## Future Milestones (Post-Dashboard)

> Connector expansion resumes after the self-hostable product is shipped.

### Milestone 12 — Issue + Repo Connectors

- [ ] Create `connectors/issue/interface.ts` (`IssueConnector`).
- [ ] Create `connectors/repo/interface.ts` (`RepoConnector`).
- [ ] Migrate `lib/github.ts` → `connectors/issue/github.ts` + `connectors/repo/github.ts`.
- [ ] Update `incidentActivities.ts` and `autoFix.ts` to use `resolveIssueConnectors()` + `fanOut()`.
- [ ] Store per-tracker issue numbers in `incidents` Postgres table.
- [ ] Follow-on connectors: `jira.ts`, `linear.ts`, `gitlab.ts` (issue); `gitlab.ts`, `bitbucket.ts` (repo).
- [ ] Dashboard: connector selector UI for issue tracker + repo host (via settings page)

---

### Milestone 13 — Notification Connectors

- [ ] Create `connectors/notification/interface.ts` (`NotificationConnector`) with `NotificationEvent` union type.
- [ ] Implement `connectors/notification/slack.ts` (incoming webhook).
- [ ] Implement `connectors/notification/pagerduty.ts` (Events API v2).
- [ ] Implement `connectors/notification/webhook.ts` (generic HTTP POST).
- [ ] Wire `fanOut()` calls at incident raised, auto-fix started/succeeded/failed.
- [ ] Add `NOTIFY_CONNECTORS=` to config and dashboard settings.

---

### Milestone 14 — Additional Source Connectors

- [ ] `connectors/source/datadog.ts` — Datadog Logs API.
- [ ] `connectors/source/cloudwatch.ts` — AWS CloudWatch Logs.
- [ ] `connectors/source/elasticsearch.ts` — Elasticsearch / OpenSearch.
- [ ] Dashboard: source connector selector (Loki / Datadog / CloudWatch) with per-connector config fields.

---

### Milestone 15 — Sandbox Reliability + Cost Controls

- [ ] Add resource limits (CPU/memory/pids) to Docker sandbox runs.
- [ ] Log token usage per LLM + embedding call.
- [ ] Enforce per-run budgets; route low-severity incidents to cheaper models.
- [ ] Dashboard: cost metrics panel (tokens used, estimated cost per run).

---

### Milestone 16 — InfraConnector — Deploy Pod Control

- [ ] Create `connectors/infra/interface.ts` (`InfraConnector`).
- [ ] Implement `connectors/infra/kubernetes.ts` (kubectl / Kubernetes API).
- [ ] Add `mitigateWithInfra(incident)` Temporal activity — runs in parallel with LLM fix pipeline.
- [ ] Dashboard: infra actions panel (restart pod, scale deployment, rollback).

---

### Milestone 17 — Self-Learning Feedback Loop

- [ ] Extend `auto_fix_attempts` with `production_outcome` and `recurrence_within_24h`.
- [ ] Add `evaluateFixOutcome()` Temporal activity — polls for PR merge status and incident recurrence.
- [ ] Feed outcomes back into fixability scoring heuristics.
- [ ] Dashboard: weekly digest metrics (fix success rate, avg MTTR, cost per fix).
