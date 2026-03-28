---
name: agentic-patterns
description: Coding patterns extracted from the agentic AI incident-response agent monorepo
version: 1.1.0
source: local-git-analysis
analyzed_commits: 18+unstaged
---

# Agentic Project Patterns

## Commit Conventions

This project uses **conventional commits** strictly:

| Prefix | Use |
|--------|-----|
| `feat:` | New functionality |
| `fix:` | Bug corrections |
| `test:` | Test additions / coverage |
| `docs:` | Documentation only |
| `chore:` | Maintenance (deps, config, CI) |
| `refactor:` | Code restructuring without behavior change |
| `perf:` | Performance improvements |
| `ci:` | CI/CD pipeline changes |

Commit bodies are detailed and descriptive — describe *what changed and why*, not just "update X".

---

## Repository Structure

```
packages/
└── agent/
    └── src/
        ├── activities/      # Temporal activity implementations + tests
        ├── autofix/         # Auto-fix incident workflow logic
        ├── connectors/
        │   ├── llm/         # LLM provider implementations (openai, anthropic, gemini)
        │   ├── embedding/   # Embedding provider implementations
        │   ├── source/      # Log-source connectors (loki, …)
        │   ├── registry.ts  # Factory functions + multi-connector utilities
        │   └── **/interface.ts  # Provider interface (always separate file)
        ├── lib/             # Pure utilities: config, llm, embeddings, retry, severity, etc.
        ├── memory/          # Persistent storage (postgres, repo)
        ├── observability/   # OpenTelemetry setup
        ├── rag/             # RAG pipeline (index, retrieve, cache, refresh)
        ├── tools/           # Side-effectful tools (docker sandbox)
        ├── workflows/       # Temporal workflow definitions (no side effects)
        ├── worker.ts        # Temporal worker entry point
        └── run.ts           # CLI / scheduler entry point
apps/
└── demo-services/           # Companion demo app that generates test incidents
```

---

## Connector Pattern

Every provider type follows the same three-file structure:

### 1. `interface.ts` — thin TypeScript interface only

```ts
export interface LlmConnector {
  complete(prompt: string, opts: { maxTokens: number; temperature: number }): Promise<string>;
}
```

### 2. `<provider>.ts` — implements the interface, wraps the SDK

```ts
export class OpenAILlmConnector implements LlmConnector { … }
```

### 3. `registry.ts` — factory + multi-connector utilities

```ts
// resolve*(config) — ordered list from env, skips missing keys
export function resolveLlmConnectors(config: Config): LlmConnector[]

// create*(resolved, config) — construct a single known connector
export function createLlmConnector(resolved: { provider; model }, config: Config): LlmConnector
```

**Rule:** new connector type → new `connectors/<type>/` directory, new `resolve*` / `create*` pair in `registry.ts`.

---

## Multi-Connector Utilities (registry.ts)

Four patterns for orchestrating multiple connectors:

```ts
// 1. Fallback chain — first success wins (LLM calls)
await withFallback(connectors, (c) => c.complete(prompt, opts));

// 2. Fan-out — all fire, individual failures swallowed (notifications)
await fanOut(handlers, event);

// 3. Parallel aggregation with dedup — merge log sources
await aggregateLogs(sourceConnectors, { start, end, limit });

// 4. Parallel settle — collect what succeeded, discard failures
const settled = await Promise.allSettled(items.map(fn));
```

---

## Configuration Pattern

All configuration lives in `lib/config.ts`:

- **Zod schema** validates every env var at startup with `.default()` and `.optional()`.
- Returns a typed `Config` object (no raw `process.env` access elsewhere).
- Cached singleton: first call parses, subsequent calls return cached value.
- New env vars → add to `ConfigSchema` with a sensible default; update `.env.example`.

```ts
const ConfigSchema = z.object({
  FOO: z.string().default("bar"),
  COUNT: z.coerce.number().int().positive().default(10),
});
export type Config = z.infer<typeof ConfigSchema>;

export function getConfig(): Config { … }  // cached
```

---

## Temporal Workflow Pattern

Workflows (`src/workflows/`) are **pure** — no I/O, no imports from `lib/`.

```ts
// Declare activities with timeouts at the top
const { fetchRecentLogs, detectIncidents } = proxyActivities<…>({
  startToCloseTimeout: "2 minutes",
  retry: { maximumAttempts: 3 },
});

// Long-running (auto-fix) gets its own proxyActivities block with longer timeout
const { autoFixIncident } = proxyActivities<…>({
  startToCloseTimeout: "15 minutes",
  retry: { maximumAttempts: 1 },
});
```

Activities (`src/activities/`) do the real work; they call into `lib/`, `memory/`, `rag/`, etc.

The canonical log-fetch activity pattern:

```ts
// activities/incidentActivities.ts
export async function fetchRecentLogs(input: FetchLogsInput): Promise<LogEvent[]> {
  const end = new Date();
  const start = new Date(end.getTime() - input.lookbackMinutes * 60 * 1000);
  return aggregateLogs(resolveSourceConnectors(getConfig()), { start, end, limit: 500 });
}
```

`resolveSourceConnectors` + `aggregateLogs` are always called together — never wire a single connector directly in an activity.

---

## Auto-Fix Plan-Patch-Verify Loop

The core auto-fix algorithm (in `autofix/autoFix.ts`):

1. **Assess fixability** — LLM decides if fix is feasible (returns a 0–1 score).
2. **Generate plan** — LLM produces a `FixPlan` (file list + strategy).
3. **Generate patch** — LLM rewrites each file.
4. **Verify in sandbox** — run `AUTO_FIX_TEST_COMMAND` inside Docker.
5. **Open PR** — on success, commit to branch and call GitHub API.

Failures are tracked in Postgres (`memory/postgres.ts`) and guarded by `AUTO_FIX_SKIP_AFTER_FAILURES`.

---

## Retry Utility

Use `withRetry` from `lib/retry.ts` for any fallible I/O:

```ts
await withRetry(
  () => someApiCall(),
  { attempts: 3, delayMs: 500, backoff: 2, maxDelayMs: 30_000 }
);
```

Features: exponential backoff, full-jitter (avoids thundering herd), configurable cap.

---

## Testing Patterns

- **Framework**: Vitest (`packages/agent/vitest.config.ts`)
- **Coverage target**: 100% statements/functions/lines, 98% branches
- **File placement**: `*.test.ts` colocated with the source file (`src/lib/foo.test.ts` next to `src/lib/foo.ts`)
- **Mock strategy**: `vi.hoisted()` for spies that must survive `vi.resetModules()`; mock at the module level with `vi.mock()`

```ts
const { mockChatCreate } = vi.hoisted(() => ({
  mockChatCreate: vi.fn(),
}));
vi.mock("openai", () => ({ default: class { chat = { completions: { create: mockChatCreate } }; } }));
```

- Tests are grouped by `describe` blocks; shared test fixtures defined as `const` at the top of the file.
- `afterEach` resets module state; never share mutable state across tests.
- For connectors that call native `fetch`, use `vi.stubGlobal` with typed helper factories instead of `vi.mock`:

```ts
function okResponse(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data), text: () => Promise.resolve("") };
}
function errorResponse(status: number, body = "") {
  return { ok: false, status, text: () => Promise.resolve(body), json: () => Promise.reject(new Error("not json")) };
}

vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ data: { result: [] } })));
```

`afterEach(() => vi.restoreAllMocks())` cleans up stubs automatically.

---

## TypeScript / ESM Conventions

- All imports use the `.js` extension (ESM with `"type": "module"` in `package.json`).
- Interfaces are in `interface.ts`; implementations in `<name>.ts`.
- Prefer `import type` when only the type is used (no runtime cost).
- Zod for runtime validation at system boundaries (`lib/config.ts`, activity inputs).
- No `any` — prefer `unknown` and narrow explicitly.

---

## Source Connector Implementation Guide

### Structure of a source connector (`loki.ts` as reference)

```ts
export class LokiSourceConnector implements SourceConnector {
  constructor(
    private readonly url: string,   // config baked in at construction
    private readonly query: string,
  ) {}

  async fetchLogs(opts: { start: Date; end: Date; limit: number }): Promise<LogEvent[]> {
    // 1. Build URL params — convert Date to nanoseconds for Loki
    // 2. fetch() with try/catch around the network call (throw descriptive Error)
    // 3. Check response.ok — read body text for error context
    // 4. Parse JSON with try/catch — throw on invalid JSON
    // 5. Validate shape with a private extractStreams() helper that returns null on bad shape
    // 6. Map to LogEvent[] and return
  }

  private extractStreams(payload: unknown): LokiStream[] | null {
    // Use typeof/instanceof guards to narrow unknown → typed structure
    // Return null (not throw) when shape doesn't match — caller warns and returns []
  }
}
```

Key rules:
- Constructor takes only what the connector needs (no `Config` object — registry passes the relevant fields).
- `fetchLogs` throws on hard failures (network error, non-2xx); returns `[]` on empty/unexpected data.
- Use BigInt for nanosecond timestamps: `BigInt(date.getTime()) * 1_000_000n`.
- Warn via `logger.warn` (not throw) when the response is structurally unexpected.

### Adding a new log source connector

1. Create `src/connectors/source/<name>.ts` implementing `SourceConnector`.
2. Add `<name>` to the `resolveSourceConnectors` flatMap in `registry.ts`.
3. Add the necessary config keys to `ConfigSchema` in `lib/config.ts`.
4. Document the new key in `.env.example`.
5. Write `src/connectors/source/<name>.test.ts` with 100% coverage using `vi.stubGlobal("fetch", …)`.

---

## Adding a New LLM Provider

1. Create `src/connectors/llm/<name>.ts` implementing `LlmConnector`.
2. Add it to `resolveLlmConnectors` and `createLlmConnector` in `registry.ts`.
3. Add `<NAME>_API_KEY` and `<NAME>_MODEL` to `ConfigSchema`.
4. Update `.env.example`.
5. Extend `LLM_PROVIDER` enum or document the new `LLM_CONNECTORS` value.
