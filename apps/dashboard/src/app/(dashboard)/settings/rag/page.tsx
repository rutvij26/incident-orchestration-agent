export const dynamic = "force-dynamic";
import { RagSettings } from "./RagSettings";
import { readConfig } from "@/lib/config";

export default async function RagPage() {
  const records = await readConfig("rag");
  const get = (key: string) => records.find((r) => r.key === key)?.value ?? "";
  return (
    <RagSettings
      initialRepoUrl={get("REPO_URL")}
      initialTopK={get("RAG_TOP_K")}
      initialMinScore={get("RAG_MIN_SCORE")}
      initialChunkSize={get("RAG_CHUNK_SIZE")}
    />
  );
}
