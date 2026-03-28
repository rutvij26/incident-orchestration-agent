export const dynamic = "force-dynamic";
import { IntegrationsSettings } from "./IntegrationsSettings";
import { readConfig } from "@/lib/config";

export default async function IntegrationsPage() {
  const [llm, github] = await Promise.all([
    readConfig("llm"),
    readConfig("github"),
  ]);
  const get = (records: typeof llm, key: string) =>
    records.find((r) => r.key === key)?.value ?? "";
  return (
    <IntegrationsSettings
      initialAnthropicKey={get(llm, "ANTHROPIC_API_KEY")}
      initialAnthropicModel={get(llm, "ANTHROPIC_MODEL")}
      initialOpenaiKey={get(llm, "OPENAI_API_KEY")}
      initialOpenaiModel={get(llm, "OPENAI_MODEL")}
      initialGeminiKey={get(llm, "GEMINI_API_KEY")}
      initialGeminiModel={get(llm, "GEMINI_MODEL")}
      initialGithubToken={get(github, "GITHUB_TOKEN")}
      initialGithubOwner={get(github, "GITHUB_OWNER")}
      initialGithubRepo={get(github, "GITHUB_REPO")}
    />
  );
}
