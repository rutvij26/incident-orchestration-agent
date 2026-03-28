import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Separator } from "./separator";

describe("Separator", () => {
  it("renders horizontal separator by default", () => {
    const { container } = render(<Separator />);
    const el = container.firstChild as HTMLElement;
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("h-[1px]");
  });

  it("renders vertical separator", () => {
    const { container } = render(<Separator orientation="vertical" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("w-[1px]");
  });

  it("accepts custom className", () => {
    const { container } = render(<Separator className="my-sep" />);
    expect((container.firstChild as HTMLElement).className).toContain("my-sep");
  });
});
