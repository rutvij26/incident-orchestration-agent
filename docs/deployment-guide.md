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
- `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`

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

### Docker (agent in container)
```
docker compose -f apps/observability/docker-compose.yml exec -T agent npm run run
```

## Step 6: Verify results

- Check GitHub Issues for created incidents.
- View logs in Grafana (Loki datasource).
- Inspect memory table `incident_memory` in Postgres.

## Troubleshooting

- If no issues appear, verify `GITHUB_*` environment variables.
- If no incidents are detected, confirm Loki labels and query.
- If Temporal is not ready, check `TEMPORAL_ADDRESS` and DB connectivity.
