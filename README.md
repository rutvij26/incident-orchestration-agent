# Incident Orchestration Agent

Reliability-first agent that monitors OpenTelemetry + Loki logs, triages incidents, and escalates to GitHub Issues. Built for production engineering signals: Temporal workflows, Postgres + pgvector memory, and safe tooling.

## Architecture

```mermaid
flowchart TD
  appLogs[AppLogs] --> otel[OtelCollector]
  otel --> loki[LokiStore]
  loki --> detector[IncidentDetector]
  detector --> triage[TriageAndSeverity]
  triage --> memory[PostgresMemory]
  triage --> policy[EscalationPolicy]
  policy --> issues[GitHubIssues]
  policy --> dashboard[GrafanaDashboard]
```

## Agent Loop

```mermaid
flowchart TD
  ingest[IngestLogs] --> reason[ReasonAndCluster]
  reason --> decide[DecideEscalation]
  decide --> act[CreateIssueOrReport]
  act --> learn[PersistMemory]
  learn --> ingest
```

## Reliability Engineering

- **Retry strategy:** Temporal retries for transient failures + local backoff for API calls.
- **Failure cases:** missing GitHub token, Loki outage, Postgres unavailable, malformed logs.
- **Safety:** auto-escalation thresholds + manual approval mode.

## Evaluation Metrics

- Mean time to detect (MTTD)
- Incident precision/recall
- False positive rate
- Escalation latency

## Tech Stack

- TypeScript + Node.js
- Temporal workflows
- Postgres + pgvector
- OpenTelemetry + Loki + Grafana
- OpenAI/Anthropic APIs (optional for enrichment)

## Quickstart

1. Copy `.env.example` to `.env` and set credentials.
2. Start everything with Docker:
   ```
   npm run dev:all
   ```
3. Run one incident sweep (from your host terminal):
   ```
   npm run run
   ```

### Local (no Docker) mode

```
npm run dev:stack
npm run dev:demo
npm run dev:agent
npm run run
```

## License

MIT
# incident-orchestration-agent
