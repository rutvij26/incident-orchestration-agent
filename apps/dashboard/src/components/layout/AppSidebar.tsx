"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  AlertTriangle,
  Settings,
  Wrench,
  Flame,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/overview", icon: Home, label: "Overview" },
  { href: "/incidents", icon: AlertTriangle, label: "Incidents" },
  { href: "/settings/general", icon: Settings, label: "Settings" },
  { href: "/autofix", icon: Wrench, label: "Auto-fix" },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="flex h-screen w-12 flex-col items-center border-r border-zinc-800 bg-zinc-900 py-3">
        {/* Logo */}
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
          <Flame className="h-5 w-5 text-white" />
        </div>

        <div className="w-full border-t border-zinc-800 mb-2" />

        {/* Nav icons */}
        <nav className="flex flex-1 flex-col items-center gap-1 w-full px-1.5">
          {navItems.map(({ href, icon: Icon, label }) => {
            const isActive =
              href === "/overview"
                ? pathname === "/overview"
                : pathname.startsWith(href);
            return (
              <Tooltip key={href}>
                <TooltipTrigger asChild>
                  <Link
                    href={href}
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                      isActive
                        ? "bg-zinc-800 text-indigo-400"
                        : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{label}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
      </aside>
    </TooltipProvider>
  );
}
