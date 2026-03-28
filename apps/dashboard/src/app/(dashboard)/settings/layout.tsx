import Link from "next/link";
import { Separator } from "@/components/ui/separator";

const tabs = [
  { href: "/settings/general", label: "General" },
  { href: "/settings/integrations", label: "Integrations" },
  { href: "/settings/autofix", label: "Auto-fix" },
  { href: "/settings/rag", label: "RAG" },
  { href: "/settings/advanced", label: "Advanced" },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-zinc-100">Settings</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Configure your agent. Changes take effect within 30 seconds.
      </p>
      <Separator className="my-4 bg-zinc-800" />
      <nav className="flex gap-1 mb-6">
        {tabs.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
