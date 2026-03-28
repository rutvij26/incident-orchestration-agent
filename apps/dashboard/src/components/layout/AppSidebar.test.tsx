import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { AppSidebar } from "./AppSidebar";

const mockUsePathname = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

describe("AppSidebar", () => {
  it("renders all nav items", () => {
    mockUsePathname.mockReturnValue("/overview");
    const { container } = render(<AppSidebar />);
    expect(container.querySelector('a[href="/overview"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/settings/general"]')).toBeInTheDocument();
    expect(container.querySelector('a[href="/autofix"]')).toBeInTheDocument();
  });

  it("marks /overview link as active when on /overview (exact match)", () => {
    mockUsePathname.mockReturnValue("/overview");
    const { container } = render(<AppSidebar />);
    const overviewLink = container.querySelector('a[href="/overview"]') as HTMLElement;
    expect(overviewLink.className).toContain("indigo");
  });

  it("does not mark /overview as active when on a different path", () => {
    mockUsePathname.mockReturnValue("/settings/general");
    const { container } = render(<AppSidebar />);
    const overviewLink = container.querySelector('a[href="/overview"]') as HTMLElement;
    expect(overviewLink.className).not.toContain("indigo");
  });

  it("marks /settings link as active when path starts with /settings", () => {
    mockUsePathname.mockReturnValue("/settings/general");
    const { container } = render(<AppSidebar />);
    const settingsLink = container.querySelector('a[href="/settings/general"]') as HTMLElement;
    expect(settingsLink.className).toContain("indigo");
  });

  it("marks /autofix link as active when path starts with /autofix", () => {
    mockUsePathname.mockReturnValue("/autofix/list");
    const { container } = render(<AppSidebar />);
    const autofixLink = container.querySelector('a[href="/autofix"]') as HTMLElement;
    expect(autofixLink.className).toContain("indigo");
  });
});
