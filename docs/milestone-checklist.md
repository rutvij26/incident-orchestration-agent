## Milestone Checklist

Track implementation status for each prioritized milestone.

### RAG Isolation + Incremental Indexing

- [x] Add `repo_key` to `repo_embeddings` and scope retrieval by repo.
- [x] Re-embed only changed chunks (use `content_hash` or `git diff`).
- [x] Add minimum similarity threshold for retrieved context.

### Auto-fix Decision Scoring

- [ ] Add fixability score using LLM confidence + heuristics.
- [ ] Persist auto-fix attempts/outcomes to prevent repeated bad fixes.

### Prompt Architecture Hardening

- [ ] Split prompt into plan → patch → verify loop.
- [ ] Require file list + anchors from retrieved context for grounding.

### Sandbox Reliability + Runtime Limits

- [ ] Add resource limits to sandbox runs (CPU/memory/pids).
- [ ] Add optional network allowlist or dependency cache.
- [ ] Fix branch collision handling and add repo locks.

### Cost Controls + Telemetry

- [ ] Log token usage for LLM + embeddings.
- [ ] Enforce per-run budgets and use smaller models for low severity.
- [ ] Add metrics for auto-fix success rate and RAG quality.

### Governance + Approval

- [ ] Add approval gate before auto-fix for high/critical incidents.
- [ ] Support `label`/`comment`/`always` approval modes with audit logging.
