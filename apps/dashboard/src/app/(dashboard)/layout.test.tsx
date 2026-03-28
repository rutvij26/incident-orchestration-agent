import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DashboardLayout from "./layout";

vi.mock("next/navigation", () => ({ usePathname: () => "/overview" }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("DashboardLayout", () => {
  it("renders children with sidebar", () => {
    render(<DashboardLayout><div>Dashboard page</div></DashboardLayout>);
    expect(screen.getByText("Dashboard page")).toBeInTheDocument();
  });
});
