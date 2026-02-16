# Deployment Guide (Step-by-Step)

This guide explains how to clone, deploy, and run the incident orchestration agent in your own infrastructure.

## What you need

### Core dependencies
- Docker (or Kubernetes equivalents)
- Node.js 20+ (for local dev / non-Docker runs)
- A GitHub repo (for incident issues) and a token with `repo` scope

### Required infrastructure services
- **Temporal** (workflow orchestration) + **Postgres** for Temporal
- **Loki** for logs + **Promtail** or another log shipper
- **OpenTelemetry Collector** (optional but recommended for traces)
- **Postgres + pgvector** for memory

### Optional
- Grafana (UI for logs/traces)
- Tempo (trace storage)

## Step 1: Clone the repo

```
git clone https://github.com/rutvij26/incident-orchestration-agent.git
cd incident-orchestration-agent
```

## Step 2: Configure environment

Copy the example environment file and set values:

```
copy .env.example .env
```

Required values for production:

- `LOKI_URL` (your Loki endpoint)
- `POSTGRES_URL` (your memory database)
- `TEMPORAL_ADDRESS` (Temporal frontend address)
- `GITHUB_TOKEN`, `REPO_URL` (or `GITHUB_OWNER` + `GITHUB_REPO`)
- `DEMO_HEALTH_URL` (optional healthcheck target)

Optional LLM enrichment:

- `LLM_PROVIDER` (`auto`, `openai`, `anthropic`, or `gemini`)
- `OPENAI_API_KEY`, `OPENAI_MODEL` (if using OpenAI)
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` (if using Anthropic)
- `GEMINI_API_KEY`, `GEMINI_MODEL` (if using Gemini)

When configured, the agent adds an LLM summary, root-cause hypothesis, suggested severity, and next steps to each GitHub issue.

Optional repo RAG:

- `RAG_REPO_PATH` (path to local repo checkout)
- `RAG_REPO_CACHE_DIR` (default `.agentic/repos`)
- `RAG_REPO_REFRESH` (`pull` or `reclone`)
- `REPO_URL` (used to clone if `RAG_REPO_PATH` is not set)
- `EMBEDDING_PROVIDER` (`auto`, `openai`, `gemini`, or `none`)
- `EMBEDDING_MODEL`, `EMBEDDING_DIM`, `RAG_TOP_K`, `RAG_MIN_SCORE`, `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`

If `RAG_REPO_PATH` is not set, the agent clones `GITHUB_OWNER/GITHUB_REPO` into `RAG_REPO_CACHE_DIR` using `GITHUB_TOKEN`.
The cache is refreshed on each workflow run, and you can refresh it manually:

```
npm run rag:refresh
```

Optional auto-fix PRs:

- `AUTO_FIX_MODE=on`
- `AUTO_FIX_SEVERITY` (`low|medium|high|critical|all`)
- `AUTO_FIX_REPO_PATH` (path to local repo checkout; otherwise uses cached clone)
- `AUTO_FIX_TEST_COMMAND` (default `npm run test`)
- `AUTO_FIX_INSTALL_COMMAND` (default `npm install --include=dev`)
- `AUTO_FIX_SANDBOX_IMAGE` (default `node:20-slim`)
- `GITHUB_DEFAULT_BRANCH` (default `main`)
Note: auto-fix runs only when incidents are escalated to issues. Set `AUTO_ESCALATE_FROM=low` to auto-fix all severities.

### Docker auto-fix requirements
- Mount the Docker socket into the agent container for sandboxed tests (`/var/run/docker.sock`).
- Bind mount `./.agentic/repos` into the agent container so cached clones persist.

## Step 3: Deploy infrastructure

### Option A: Use the included Docker Compose (quick start)

```
npm run dev:all
```

This starts Loki, Promtail, OTel Collector, Tempo, Grafana, Temporal, Postgres, demo services, and the agent.

### Option B: Bring your own infra

If your org already runs these services:

- Point `LOKI_URL` to your Loki cluster
- Point `TEMPORAL_ADDRESS` to your Temporal frontend
- Point `POSTGRES_URL` to your memory DB
- Ensure logs are shipped with a `job` label that you can query

## Step 4: Update the Loki query

The agent currently queries:

```
{job="demo-services"}
```

Update the query in `packages/agent/src/run.ts` to match your labels, for example:

```
{job="api-gateway"} |= "ERROR"
```

## Step 5: Run the worker and trigger a scan

### Local (no Docker)
```
npm install
npm run dev:agent
npm run run
```

### Docker note
The Docker agent starts the worker only. Run `npm run rag:index` manually when you want to (the indexer skips if the repo HEAD hasn't changed).

### Optional: Build repo RAG index
```
npm run rag:index
```

### Optional: Auto-fix PRs
- Ensure the repo path is accessible on the machine running the agent.
- Ensure `git` is installed and authenticated with a remote that allows pushes.

### Docker (agent in container)
```
docker compose -f apps/observability/docker-compose.yml exec -T agent npm run run
```

## Step 6: Health checks and tests

```
npm run healthcheck
npm run test
```

The healthcheck verifies Loki, Postgres, Temporal, and the demo service.

## Step 7: Verify results

- Check GitHub Issues for created incidents.
- View logs in Grafana (Loki datasource).
- Open the "Incident Overview" dashboard in Grafana.
- Inspect memory table `incident_memory` in Postgres.

## CI

GitHub Actions runs the stack, healthcheck, and unit tests on push/PR using `.github/workflows/ci.yml`.

## Troubleshooting

- If no issues appear, verify `GITHUB_*` environment variables.
- If no incidents are detected, confirm Loki labels and query.
- If Temporal is not ready, check `TEMPORAL_ADDRESS` and DB connectivity.
