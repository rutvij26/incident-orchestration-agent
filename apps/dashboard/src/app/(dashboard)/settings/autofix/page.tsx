export const dynamic = "force-dynamic";
import { AutofixSettings } from "./AutofixSettings";
import { readConfig } from "@/lib/config";

export default async function AutofixPage() {
  const records = await readConfig("autofix");
  const get = (key: string) => records.find((r) => r.key === key)?.value ?? "";
  return (
    <AutofixSettings
      initialMode={get("AUTO_FIX_MODE")}
      initialSeverity={get("AUTO_FIX_SEVERITY")}
      initialBranchPrefix={get("AUTO_FIX_BRANCH_PREFIX")}
      initialTestCommand={get("AUTO_FIX_TEST_COMMAND")}
    />
  );
}
