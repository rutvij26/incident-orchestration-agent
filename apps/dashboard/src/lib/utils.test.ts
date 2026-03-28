import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("deduplicates conflicting tailwind classes", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("ignores falsy values", () => {
    expect(cn("foo", undefined, null, false, "bar")).toBe("foo bar");
  });

  it("handles conditional classes", () => {
    const active = true;
    expect(cn("base", active && "active")).toBe("base active");
    expect(cn("base", !active && "inactive")).toBe("base");
  });

  it("handles no arguments", () => {
    expect(cn()).toBe("");
  });

  it("handles array of classes", () => {
    expect(cn(["a", "b"], "c")).toBe("a b c");
  });
});
