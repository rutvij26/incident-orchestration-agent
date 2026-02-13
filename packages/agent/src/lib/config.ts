import { z } from "zod";

const ConfigSchema = z.object({
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  LOKI_URL: z.string().default("http://localhost:3100"),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_OWNER: z.string().optional(),
  GITHUB_REPO: z.string().optional(),
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
  ANTHROPIC_MODEL: z.string().default("claude-3-5-sonnet-20240620"),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-1.5-flash"),
  AUTO_ESCALATE_FROM: z
    .enum(["low", "medium", "high", "critical", "none"])
    .default("high"),
});

let cachedConfig: z.infer<typeof ConfigSchema> | null = null;

export function getConfig(): z.infer<typeof ConfigSchema> {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = ConfigSchema.parse(process.env);
  cachedConfig = parsed;
  return parsed;
}
