import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import RootLayout from "./layout";

describe("RootLayout", () => {
  it("renders children inside the layout", () => {
    render(<RootLayout><div>Page content</div></RootLayout>);
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });
});
