import { describe, expect, it } from "vitest";
import { severityRank } from "./severity.js";

describe("severityRank", () => {
  it("returns 4 for critical", () => expect(severityRank("critical")).toBe(4));
  it("returns 3 for high", () => expect(severityRank("high")).toBe(3));
  it("returns 2 for medium", () => expect(severityRank("medium")).toBe(2));
  it("returns 1 for low", () => expect(severityRank("low")).toBe(1));
  it("returns 1 for unknown values", () => expect(severityRank("unknown")).toBe(1));
  it("returns 1 for empty string", () => expect(severityRank("")).toBe(1));
});
