import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Progress } from "./progress";

describe("Progress", () => {
  it("renders with a value", () => {
    const { container } = render(<Progress value={50} />);
    expect(container.firstChild).toBeInTheDocument();
    const indicator = container.querySelector("[style]") as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-50%)");
  });

  it("defaults to 0 when value is not provided", () => {
    const { container } = render(<Progress />);
    const indicator = container.querySelector("[style]") as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-100%)");
  });

  it("renders with value=0", () => {
    const { container } = render(<Progress value={0} />);
    const indicator = container.querySelector("[style]") as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-100%)");
  });

  it("accepts custom className", () => {
    const { container } = render(<Progress className="my-progress" value={25} />);
    expect((container.firstChild as HTMLElement).className).toContain("my-progress");
  });
});
