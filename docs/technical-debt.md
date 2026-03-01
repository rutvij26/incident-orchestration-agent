# Technical Debt & Chore Checklist

Track code quality, reliability, and infrastructure improvements that are not feature milestones.

---

## Code Quality

- [x] Deduplicate `severityRank()` — extracted to `lib/severity.ts` (was copied in `autoFix.ts` + `incidentWorkflow.ts`)
- [x] Extract shared `execGit` into `lib/git.ts` (was duplicated in `autoFix.ts` + `rag/indexRepo.ts`)
- [ ] Replace `any` cast in `incidentWorkflow.ts` (`detected.map((item: any) => item.incident)`) with a typed assertion or Zod parse
- [ ] Consolidate duplicate LLM provider dispatch (OpenAI/Anthropic/Gemini switch) shared across `summarizeIncident`, `assessFixability`, `generateFixProposal`, `generateFixRewrite` — extract a shared `callLlm()` helper
- [ ] The `heuristicFixabilityScore` base weight (0.35) and component weights are magic numbers — move to named constants with documented rationale

---

## Error Handling

- [x] Wrap all Octokit calls in `lib/github.ts` with `try/catch` (was propagating raw Octokit errors)
- [x] Add `SIGTERM`/`SIGINT` graceful shutdown to `worker.ts`
- [x] Fix `rowCount` null coercion in `memory/repo.ts:hasRepoEmbeddings` (`rowCount` can be `null` in pg v8+)
- [x] Add JSON.parse safety + `data.result` path validation to `lib/loki.ts`
- [ ] Add per-call timeout to LLM calls in `lib/llm.ts` (currently rely on Temporal 2-min activity timeout with no fine-grained control)
- [ ] Add per-call timeout to embedding calls in `lib/embeddings.ts`
- [ ] Improve `isDockerRuntime()` in `autoFix.ts` — `/.dockerenv` detection is fragile across container runtimes; add fallback checks (`/proc/1/cgroup`, `KUBERNETES_SERVICE_HOST`)
- [ ] Add temp workspace cleanup (`fs.rm(tempDir, { recursive: true })`) in a `finally` block after auto-fix sandbox run

---

## Reliability

- [x] Add exponential backoff + jitter to `lib/retry.ts` (was fixed linear delay — causes lockstep retries under load)
- [ ] Add a DB-level `CHECK (fixability_score >= 0 AND fixability_score <= 1)` constraint on `auto_fix_attempts.fixability_score`
- [ ] Add a `NUMERIC(4,3)` precision note or change to `FLOAT8` for `fixability_score` (current `NUMERIC(3,2)` silently truncates scores like `0.637` to `0.64`)
- [ ] `autoFix.ts`: detect and handle already-existing remote branch before `git checkout -b` (branch collision)
- [ ] `autoFix.ts`: add repo lock (advisory lock or `.lock` file) to prevent two auto-fix runs on the same repo simultaneously

---

## Configuration & Environment

- [x] Add `LOKI_QUERY` env var so the Loki selector doesn't require a code change to deploy against real log streams
- [x] Add `GRAFANA_USER` / `GRAFANA_PASSWORD` to `.env.example` (were used in Docker Compose but undocumented)
- [x] Document `AUTO_ESCALATE_FROM=none` as a valid value in `.env.example`
- [ ] Add `LOOKBACK_MINUTES` as an env var (currently hardcoded to `15` in `run.ts`)
- [ ] Add `WORKFLOW_TIMEOUT_MS` as an env var (currently hardcoded to `120000` in `run.ts`)

---

## Infrastructure & Build

- [x] Add `.dockerignore` to `packages/agent/` and `apps/demo-services/` (entire working tree was sent to Docker daemon on every build)
- [ ] Make agent `Dockerfile` monorepo-aware: copy root `package-lock.json` into image so `npm install` resolves from locked versions
- [ ] Replace `sleep 40` in CI (`ci.yml`) with a polling loop that checks healthcheck endpoints, reducing both fragility and CI time
- [ ] Verify `npm run build` (TypeScript compile) in CI — currently only `tsx` JIT is exercised, so production build correctness is unverified
- [ ] Add Kubernetes manifests (Deployment, Service, ConfigMap, Secret, CronJob for one-shot runs) as promised in the deployment guide

---

## Database / Schema

- [ ] Introduce a migration tool (e.g. `node-pg-migrate` or `db-migrate`) to replace the inline `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` pattern
- [ ] Move the ad-hoc `ALTER TABLE repo_embeddings ADD COLUMN IF NOT EXISTS repo_key` migration out of `initRepoMemory()` into a proper migration file
- [ ] Add `NOT NULL` constraint + `CHECK` constraint for `outcome` column in `auto_fix_attempts` to enforce the `AutoFixOutcome` type at the DB level

---

## Observability & Logging

- [ ] Structured JSON logging: replace the plain-string console logger in `lib/logger.ts` with JSON-formatted output so Promtail/Loki can parse fields without regex
- [ ] Add correlation IDs (workflow run ID or incident ID) as a logging context carried through the entire activity chain
- [ ] Log token usage from LLM responses (OpenAI `usage.total_tokens`, Anthropic `usage.input_tokens + output_tokens`) for cost tracking
- [ ] Add Prometheus/OTel metrics for: auto-fix success rate, fixability score distribution, RAG retrieval count, LLM call latency

---

## Testing

- [ ] Unit tests for `lib/severity.ts`
- [ ] Unit tests for `lib/retry.ts` (backoff timing, max attempts)
- [ ] Unit tests for `lib/repoTarget.ts` (all 5 URL formats)
- [ ] Unit tests for `lib/github.ts` (mocked Octokit — test error path returns `created: false`)
- [ ] Unit tests for `lib/loki.ts` (mocked fetch — test bad status, malformed JSON, empty result)
- [ ] Unit tests for `lib/embeddings.ts` (provider resolution, dimension mismatch)
- [ ] Unit tests for `autofix/autoFix.ts` (fixability scoring, repeated-failure skip, denylist check)
- [ ] Unit tests for `memory/postgres.ts` (mocked pg — record/retrieve auto-fix attempts)
- [ ] Unit tests for `memory/repo.ts` (mocked pg — upsert, search, cleanup)
- [ ] Unit tests for `rag/indexRepo.ts` (chunking, hash comparison, incremental skip)
- [ ] Integration test: full workflow run against a mock Loki + mock GitHub
