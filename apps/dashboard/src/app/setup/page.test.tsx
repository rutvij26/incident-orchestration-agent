import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import SetupPage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("SetupPage", () => {
  it("renders the setup wizard", () => {
    render(<SetupPage />);
    expect(screen.getByText("Welcome to Agentic")).toBeInTheDocument();
  });
});
