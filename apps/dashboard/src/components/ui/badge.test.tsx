import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge, badgeVariants } from "./badge";

describe("Badge", () => {
  it("renders with default variant", () => {
    render(<Badge>New</Badge>);
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("renders all variants without errors", () => {
    const variants = ["default", "secondary", "destructive", "outline"] as const;
    for (const variant of variants) {
      const { unmount } = render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
      unmount();
    }
  });

  it("accepts custom className", () => {
    render(<Badge className="custom-badge">Tag</Badge>);
    expect(screen.getByText("Tag")).toHaveClass("custom-badge");
  });

  it("badgeVariants returns a string", () => {
    expect(typeof badgeVariants({ variant: "outline" })).toBe("string");
  });
});
