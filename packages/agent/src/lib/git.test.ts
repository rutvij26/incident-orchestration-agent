import { describe, expect, it, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { execGit } from "./git.js";
import { spawn } from "node:child_process";

function makeChild() {
  const child = new EventEmitter() as ReturnType<typeof spawn>;
  (child as any).stdout = new EventEmitter();
  (child as any).stderr = new EventEmitter();
  return child;
}

afterEach(() => vi.clearAllMocks());

describe("execGit", () => {
  it("resolves with code 0 and combined output", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = execGit(["status"], "/repo");
    (child as any).stdout.emit("data", Buffer.from("clean\n"));
    child.emit("close", 0);
    const result = await promise;
    expect(result).toEqual({ code: 0, output: "clean\n" });
  });

  it("captures stderr in output", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = execGit(["diff"], "/repo");
    (child as any).stderr.emit("data", Buffer.from("warning"));
    child.emit("close", 1);
    const result = await promise;
    expect(result.code).toBe(1);
    expect(result.output).toBe("warning");
  });

  it("concatenates stdout and stderr", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = execGit(["log"], "/repo");
    (child as any).stdout.emit("data", Buffer.from("out"));
    (child as any).stderr.emit("data", Buffer.from("err"));
    child.emit("close", 0);
    const result = await promise;
    expect(result.output).toBe("outerr");
  });

  it("resolves with code 1 and error message on error event", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = execGit(["clone"], "/repo");
    child.emit("error", new Error("ENOENT git"));
    const result = await promise;
    expect(result.code).toBe(1);
    expect(result.output).toContain("ENOENT git");
  });

  it("uses code 1 when close code is null", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = execGit(["push"], "/repo");
    child.emit("close", null);
    const result = await promise;
    expect(result.code).toBe(1);
  });

  it("passes correct args to spawn", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = execGit(["commit", "-m", "msg"], "/myrepo");
    child.emit("close", 0);
    await promise;
    expect(spawn).toHaveBeenCalledWith(
      "git",
      ["commit", "-m", "msg"],
      expect.objectContaining({ cwd: "/myrepo" })
    );
  });
});
