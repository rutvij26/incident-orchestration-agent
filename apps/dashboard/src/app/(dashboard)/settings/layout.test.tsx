import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SettingsLayout from "./layout";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

describe("SettingsLayout", () => {
  it("renders settings nav tabs and children", () => {
    render(<SettingsLayout><div>Settings content</div></SettingsLayout>);
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "General" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Integrations" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Auto-fix" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "RAG" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Advanced" })).toBeInTheDocument();
    expect(screen.getByText("Settings content")).toBeInTheDocument();
  });
});
