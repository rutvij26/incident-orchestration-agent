import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button, buttonVariants } from "./button";

describe("Button", () => {
  it("renders with default variant and size", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("renders all variants without errors", () => {
    const variants = ["default", "destructive", "outline", "secondary", "ghost", "link"] as const;
    for (const variant of variants) {
      const { unmount } = render(<Button variant={variant}>{variant}</Button>);
      expect(screen.getByRole("button", { name: variant })).toBeInTheDocument();
      unmount();
    }
  });

  it("renders all sizes without errors", () => {
    const sizes = ["default", "sm", "lg", "icon"] as const;
    for (const size of sizes) {
      const { unmount } = render(<Button size={size}>btn</Button>);
      expect(screen.getByRole("button", { name: "btn" })).toBeInTheDocument();
      unmount();
    }
  });

  it("renders as child element when asChild is true", () => {
    render(<Button asChild><a href="/test">Link button</a></Button>);
    expect(screen.getByRole("link", { name: "Link button" })).toBeInTheDocument();
  });

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("fires onClick handler", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("accepts custom className", () => {
    render(<Button className="my-custom-class">Styled</Button>);
    expect(screen.getByRole("button")).toHaveClass("my-custom-class");
  });

  it("buttonVariants returns correct className string", () => {
    const cls = buttonVariants({ variant: "outline", size: "sm" });
    expect(typeof cls).toBe("string");
    expect(cls.length).toBeGreaterThan(0);
  });
});
