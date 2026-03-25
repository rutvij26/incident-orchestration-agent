import { z } from "zod";

export const ConfigSchema = z.object({
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  LOKI_URL: z.string().default("http://localhost:3100"),
  LOKI_QUERY: z.string().default('{job="demo-services"}'),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_OWNER: z.string().optional(),
  GITHUB_REPO: z.string().optional(),
  REPO_URL: z.string().optional(),
  GIT_USER_NAME: z.string().optional(),
  GIT_USER_EMAIL: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  DEMO_HEALTH_URL: z.string().optional(),
  POSTGRES_URL: z
    .string()
    .default("postgresql://agentic:agentic@localhost:5432/agentic"),
  LLM_PROVIDER: z
    .enum(["auto", "openai", "anthropic", "gemini"])
    .default("auto"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-5"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-1.5-flash"),
  EMBEDDING_PROVIDER: z
    .enum(["auto", "openai", "gemini", "none"])
    .default("auto"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(1536),
  RAG_TOP_K: z.coerce.number().int().positive().default(6),
  RAG_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.2),
  RAG_CHUNK_SIZE: z.coerce.number().int().positive().default(900),
  RAG_CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(150),
  RAG_REPO_PATH: z.string().optional(),
  RAG_REPO_SUBDIR: z.string().optional(),
  RAG_REPO_CACHE_DIR: z.string().default(".agentic/repos"),
  RAG_REPO_REFRESH: z.enum(["pull", "reclone"]).default("pull"),
  AUTO_FIX_MODE: z.enum(["off", "on"]).default("off"),
  AUTO_FIX_SEVERITY: z
    .enum(["low", "medium", "high", "critical", "all"])
    .default("all"),
  AUTO_FIX_REPO_PATH: z.string().optional(),
  AUTO_FIX_BRANCH_PREFIX: z.string().default("agentic-fix"),
  AUTO_FIX_TEST_COMMAND: z.string().default("npm run test"),
  AUTO_FIX_INSTALL_COMMAND: z.string().default("npm install --include=dev"),
  AUTO_FIX_SANDBOX_IMAGE: z.string().default("node:20-slim"),
  GITHUB_DEFAULT_BRANCH: z.string().default("main"),
  AUTO_FIX_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
  AUTO_FIX_SKIP_AFTER_FAILURES: z.coerce.number().int().min(0).default(1),
  AUTO_ESCALATE_FROM: z
    .enum(["low", "medium", "high", "critical", "none"])
    .default("high"),
  // Connector overrides (optional – fall back to LLM_PROVIDER / EMBEDDING_PROVIDER when absent)
  LLM_CONNECTORS: z.string().optional(),
  EMBEDDING_CONNECTOR: z.string().optional(),
  // Source connectors — comma-separated list of log backends to query
  SOURCE_CONNECTORS: z.string().default("loki"),
  // Config source: 'env' (default) reads from process.env; 'db' reads from agent_config table
  CONFIG_SOURCE: z.enum(["env", "db"]).default("env"),
  // AES-256-GCM key for encrypting sensitive config values (32-byte hex, required when CONFIG_SOURCE=db with encrypted rows)
  ENCRYPTION_KEY: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
