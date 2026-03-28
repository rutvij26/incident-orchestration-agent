import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "./AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

describe("AppShell", () => {
  it("renders children inside main", () => {
    render(<AppShell><div>Page content</div></AppShell>);
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("renders the sidebar alongside children", () => {
    render(<AppShell><div>Content</div></AppShell>);
    expect(screen.getByRole("complementary")).toBeInTheDocument(); // aside
  });
});
