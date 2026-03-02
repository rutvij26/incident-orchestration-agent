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

### Milestone 4 — Connector Foundation + LLM / Embedding Connectors

Establish the `connectors/` folder, multi-connector helpers, and migrate the already-partially-abstracted LLM and embedding providers.

- [ ] Create `packages/agent/src/connectors/registry.ts` with resolver functions and helpers:
  - `fanOut()` — parallel fire-and-forget for notifications / issue creation.
  - `withFallback()` — ordered fallback chain for LLM calls.
  - `aggregateLogs()` — parallel query + deduplicate for source connectors.
- [ ] Create `connectors/llm/interface.ts` (`LlmConnector`) and migrate providers:
  - `connectors/llm/openai.ts`, `connectors/llm/anthropic.ts`, `connectors/llm/gemini.ts`.
- [ ] Create `connectors/embedding/interface.ts` (`EmbeddingConnector`) and migrate:
  - `connectors/embedding/openai.ts`, `connectors/embedding/gemini.ts`.
- [ ] Replace internal `resolveProvider()` / dispatch logic in `lib/llm.ts` and `lib/embeddings.ts` with registry calls.
- [ ] Rename `LLM_PROVIDER` → `LLM_CONNECTORS`, `EMBEDDING_PROVIDER` → `EMBEDDING_CONNECTOR` (with deprecation aliases).

---

### Milestone 5 — Source Connectors

- [ ] Create `connectors/source/interface.ts` (`SourceConnector`).
- [ ] Migrate `lib/loki.ts` → `connectors/source/loki.ts`.
- [ ] Update `incidentActivities.fetchRecentLogs` to call `aggregateLogs()` instead of `queryLoki` directly.
- [ ] Add `SOURCE_CONNECTORS=loki` to config and `.env.example`.
- [ ] Follow-on connectors (each independent): `datadog.ts`, `cloudwatch.ts`, `elasticsearch.ts`.

---

### Milestone 6 — Issue + Repo Connectors

- [ ] Create `connectors/issue/interface.ts` (`IssueConnector`).
- [ ] Create `connectors/repo/interface.ts` (`RepoConnector`).
- [ ] Migrate `lib/github.ts` → `connectors/issue/github.ts` + `connectors/repo/github.ts`.
- [ ] Update `incidentActivities.ts` and `autoFix.ts` to use `resolveIssueConnectors()` + `fanOut()`.
- [ ] Store per-tracker issue numbers in `incidents` Postgres table.
- [ ] Follow-on connectors: `jira.ts`, `linear.ts`, `gitlab.ts` (issue); `gitlab.ts`, `bitbucket.ts` (repo).

---

### Milestone 7 — Notification Connectors

- [ ] Create `connectors/notification/interface.ts` (`NotificationConnector`) with `NotificationEvent` union type.
- [ ] Implement `connectors/notification/slack.ts` (incoming webhook).
- [ ] Implement `connectors/notification/pagerduty.ts` (Events API v2).
- [ ] Implement `connectors/notification/webhook.ts` (generic HTTP POST).
- [ ] Wire `fanOut()` calls at incident raised, auto-fix started/succeeded/failed, and approval-required trigger points.
- [ ] Add `NOTIFY_CONNECTORS=` to config and `.env.example` (empty = silent, no breaking change).

---

### Milestone 8 — Sandbox Reliability + Runtime Limits

- [ ] Add resource limits (CPU/memory/pids) to Docker sandbox runs.
- [ ] Add optional network allowlist or dependency cache.
- [ ] Fix branch collision handling and add repo locks.

---

### Milestone 9 — Cost Controls + Telemetry

- [ ] Log token usage per LLM + embedding call.
- [ ] Enforce per-run budgets; route low-severity incidents to cheaper models via `LLM_CONNECTORS` fallback chain.
- [ ] Add metrics for auto-fix success rate and RAG retrieval quality.

---

### Milestone 10 — Governance + Approval

- [ ] Add approval gate before auto-fix for high/critical incidents.
- [ ] Support `label` / `comment` / `always` approval modes with audit logging.

---

### Milestone 11 — InfraConnector — Deploy Pod Control

The "Jarvis moment": the agent can take immediate live infrastructure actions, not just submit PRs.

- [ ] Create `connectors/infra/interface.ts` (`InfraConnector`) with:
  - Read: `listPods()`, `getPodLogs()`, `describeDeployment()`.
  - Write: `restartDeployment()`, `scaleDeployment()`, `rollbackDeployment()`, `applyManifest()`.
- [ ] Implement `connectors/infra/kubernetes.ts` (wraps `kubectl` / Kubernetes API).
- [ ] Add new Temporal activity `mitigateWithInfra(incident)` — fires in parallel with the LLM fix pipeline.
- [ ] Add `INFRA_CONNECTORS=`, `KUBE_CONTEXT=`, `KUBE_NAMESPACE=` to config.
- [ ] Follow-on connectors: `ecs.ts`, `docker-compose.ts`.

---

### Milestone 12 — Multi-Service Monitoring

- [ ] Add `MONITORED_SERVICES` config — list of `{ name, source_query, repo_url, rag_subdir, issue_project }`.
- [ ] Implement fan-out parent Temporal workflow that spawns one `incidentOrchestrationWorkflow` child per service.
- [ ] Allow per-service connector overrides (e.g. one service → Jira, another → GitHub).

---

### Milestone 13 — Scan Connectors — Vulnerability & Config Drift

- [ ] Create `connectors/scan/interface.ts` (`ScanConnector`) returning `ScanFinding[]`.
- [ ] Implement `connectors/scan/npm-audit.ts` and `connectors/scan/trivy.ts`.
- [ ] Add `scanForVulnerabilities()` Temporal activity — runs all scan connectors in parallel in the sandbox.
- [ ] Feed `ScanFinding[]` into the incident pipeline as `VulnerabilityIncident` type.
- [ ] Auto-fix: generate dependency-bump PRs for critical CVEs.
- [ ] Add `SCAN_CONNECTORS=`, `SCAN_SCHEDULE=daily` to config.

---

### Milestone 14 — Self-Learning Feedback Loop

- [ ] Extend `auto_fix_attempts` Postgres table with `production_outcome` and `recurrence_within_24h` columns.
- [ ] Add `evaluateFixOutcome()` Temporal activity — polls `IssueConnector` for PR merge status, `SourceConnector` for recurrence.
- [ ] Feed outcomes back into fixability scoring heuristics.
- [ ] Surface weekly digest via `NotificationConnector`: fix success rate, avg MTTR, cost per fix.

---

### Milestone 15 — Web Portal (SRE Control Plane)

Capstone milestone. A self-hosted Next.js portal + REST/WebSocket API that makes the entire agent accessible to any org without touching config files or CLIs. Built last so every button calls something that already works in the backend.

**New packages:**
- `apps/portal/` — Next.js frontend.
- `packages/api/` — REST + WebSocket server (bridge between portal, Postgres, Temporal, and connector registry).

**Portal panels:**

- [ ] **Connectors** — add/remove/configure connectors via form UI; "Test connection" validates before saving.
- [ ] **Incidents** — live feed of detected incidents with severity, status, LLM summary, and evidence logs.
- [ ] **Approvals** — queue of auto-fix PRs awaiting review; shows diff + LLM reasoning; approve/reject unblocks Temporal workflow.
- [ ] **Activity Log** — step-by-step human-readable timeline of agent actions per incident.
- [ ] **Live Controls** — manually trigger a fix, pause/resume the agent, restart a pod, rollback a deployment — all audit-logged.
- [ ] **Stack Context** — service catalog, runbook paste-in, on-call rotation info; stored in Postgres and injected into LLM prompts.
- [ ] **Metrics** — fix success rate by incident type, avg MTTR, LLM cost per run, connector health (powered by Milestone 14 data).

**API routes:**
- [ ] `GET/POST /api/connectors` — read and update connector config.
- [ ] `GET /api/incidents` — incident feed from Postgres.
- [ ] `GET/POST /api/approvals` — pending fixes; POST unblocks Temporal approval signal.
- [ ] `POST /api/controls/{action}` — trigger fix, pause agent, restart pod.
- [ ] `GET/PUT /api/context` — service catalog and runbook store.
- [ ] `GET /api/metrics` — fix rates, cost, MTTR aggregates.
- [ ] WebSocket `/ws/feed` — real-time incident + agent activity stream.

**Auth:**
- [ ] Initial: API key / basic auth (single-org self-hosted).
- [ ] Stretch: pluggable OAuth / SSO adapter for multi-user orgs.
