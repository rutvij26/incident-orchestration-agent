export const dynamic = "force-dynamic";

import { getAutofixAttempts } from "@/lib/queries/autofix";
import { AutofixTable } from "@/components/autofix/AutofixTable";

export default async function AutofixPage() {
  const { data } = await getAutofixAttempts({ limit: 50 });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Auto-fix</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Automated fix attempts and their outcomes
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
        <AutofixTable data={data} />
      </div>
    </div>
  );
}
