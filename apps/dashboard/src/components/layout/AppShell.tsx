import { AppSidebar } from "./AppSidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      <AppSidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
