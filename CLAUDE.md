# CLAUDE.md — Agentic (SRE Jarvis)

Autonomous SRE incident-orchestration agent. Monitors logs, triages incidents, opens GitHub Issues, and raises auto-fix PRs. TypeScript monorepo powered by Temporal workflows.

---

## Repository layout

```
packages/
  agent/src/
    activities/        # Temporal activity implementations
    autofix/           # Plan → patch → verify auto-fix pipeline
    connectors/
      llm/             # LLM connectors (openai, anthropic, gemini)
      embedding/       # Embedding connectors (openai, gemini)
      source/          # Source connectors (loki, …)
      registry.ts      # fanOut / withFallback / aggregateLogs helpers
    lib/               # config, llm, embeddings, loki, github wrappers
    memory/            # Postgres-backed incident memory
    observability/     # OTel setup
    rag/               # RAG indexing + retrieval
    workflows/         # Temporal workflow definitions
    worker.ts          # Temporal worker entrypoint
    run.ts             # One-shot run entrypoint
apps/
  observability/       # Docker Compose stack (Loki, Grafana, OTel Collector)
  demo-services/       # Example Node.js app that generates structured logs
docs/
  milestone-checklist.md
```

---

## Commands

```bash
# Start observability stack (Loki, Grafana, OTLP Collector, Postgres)
npm run dev:stack

# Start demo app (generates logs and incidents)
npm run dev:demo

# Start Temporal worker
npm run dev:agent

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Index RAG repo
npm run rag:index

# Refresh RAG index (only changed chunks)
npm run rag:refresh
```

All commands run from the **repo root** and delegate to the `@agentic/agent` workspace.

---

## Architecture

### Connector pattern

Every integration is a typed connector. Add a new provider by implementing the interface and registering it — no changes to core logic.

| Type | Cardinality | Helper |
|---|---|---|
| `LlmConnector` | Ordered list | `withFallback()` |
| `EmbeddingConnector` | Single | Direct call |
| `SourceConnector` | Many | `aggregateLogs()` — parallel + deduplicate |
| `IssueConnector` | Many | `fanOut()` — parallel fire-and-forget |
| `RepoConnector` | Single | Direct call |
| `NotificationConnector` | Many | `fanOut()` |
| `InfraConnector` | Single | Direct call |
| `ScanConnector` | Many | `fanOut()` |

### Auto-fix pipeline

`autofix/` implements a plan → patch → verify loop:
1. **Plan** — LLM generates a fix plan grounded by RAG context and `git ls-files`
2. **Patch** — LLM rewrites identified files (full file content fed to prompt)
3. **Verify** — runs `AUTO_FIX_TEST_COMMAND` in a Docker sandbox, opens PR on success

### Key env vars

| Var | Purpose |
|---|---|
| `SOURCE_CONNECTORS` | Comma-separated active source connectors (e.g. `loki`) |
| `LLM_CONNECTORS` | Ordered fallback chain (e.g. `openai,anthropic`) |
| `EMBEDDING_CONNECTOR` | Single embedding provider override |
| `RAG_REPO_SUBDIR` | Scope RAG indexing to a monorepo subdirectory |
| `AUTO_FIX_MODE` | `off` / `pr` — enable auto-fix PR creation |
| `AUTO_ESCALATE_FROM` | Minimum severity to escalate: `low/medium/high/critical/none` |

Copy `.env.example` → `.env` and fill in API keys before running.

---

## Testing

- Framework: **Vitest**
- Tests live next to source files (`*.test.ts`)
- Coverage target: **80%** (enforced in CI)
- Run a single test file: `npx vitest run packages/agent/src/connectors/source/loki.test.ts`

### Adding a connector

1. Create `connectors/<type>/<name>.ts` implementing the interface in `interface.ts`
2. Register it in `connectors/registry.ts` (`createSourceConnector`, etc.)
3. Add env var docs to `.env.example`
4. Write unit tests in `<name>.test.ts` — mock HTTP/external calls with `vi.mock`

---

## Current branch

`feat/source-connectors` — implementing Milestone 5 (Source Connector fan-out). See `docs/milestone-checklist.md` for full status.
