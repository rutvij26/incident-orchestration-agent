## Functionality Flows

This document outlines the main runtime flows for detection, indexing, retrieval, and auto-fix.

### Incident detection and issue creation

```mermaid
flowchart TD
  scan[LogScan] --> detect[DetectIncidents]
  detect --> summary{LLMEnabled}
  summary -->|Yes| llm[SummarizeIncident]
  summary -->|No| skipSummary[SkipSummary]
  llm --> createIssue[CreateIssue]
  skipSummary --> createIssue
  createIssue --> autoFixGate{AutoFixEnabled}
  autoFixGate -->|Yes| autoFix[AutoFixPipeline]
  autoFixGate -->|No| done[Done]
  autoFix --> done
```

Notes:
- Issue creation targets `REPO_URL` if set, otherwise `GITHUB_OWNER/GITHUB_REPO`.
- LLM enrichment is optional and depends on `LLM_PROVIDER` + provider API keys.

### Repository indexing (RAG)

```mermaid
flowchart TD
  start[IndexCommand] --> resolveRepo[ResolveRepoPath]
  resolveRepo --> head[GetHeadSHA]
  head --> state[LoadIndexState]
  state --> unchanged{HeadUnchanged}
  unchanged -->|Yes| skip[SkipIndex]
  unchanged -->|No| walk[WalkFiles]
  walk --> embed[EmbedChunks]
  embed --> upsert[UpsertEmbeddings]
  upsert --> saveState[SaveHeadSHA]
  skip --> done[Done]
  saveState --> done
```

Notes:
- Indexing uses `RAG_REPO_PATH`, else clones using `REPO_URL` or `GITHUB_OWNER/GITHUB_REPO`.
- If the repo HEAD has not changed and embeddings exist, indexing is skipped.

### Retrieval for auto-fix

```mermaid
flowchart TD
  query[BuildQuery] --> embedQuery[EmbedQuery]
  embedQuery --> search[SearchRepoEmbeddings]
  search --> context[ReturnContextChunks]
```

Notes:
- Retrieval calls embeddings once per query.
- The top `RAG_TOP_K` chunks are sent to the fix proposal generator.

### Auto-fix pipeline

```mermaid
flowchart TD
  context[RepoContext] --> propose[GenerateDiff]
  propose --> validate[ValidateDiff]
  validate --> apply[ApplyPatchInSandbox]
  apply --> tests[RunSandboxTests]
  tests --> commit[CommitAndPush]
  commit --> pr[CreatePullRequest]
```

Notes:
- If the diff fails to apply, the system may fall back to a rewrite (if enabled).
- Auto-fix requires repo write access and `GITHUB_TOKEN`.
