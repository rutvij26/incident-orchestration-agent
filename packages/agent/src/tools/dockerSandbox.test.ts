import { describe, expect, it, vi, afterEach } from "vitest";
import { EventEmitter } from "node:events";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

import { runInSandbox } from "./dockerSandbox.js";
import { spawn } from "node:child_process";

function makeChild() {
  const child = new EventEmitter() as any;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("runInSandbox", () => {
  it("runs docker command and returns exit code + output", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = runInSandbox({ image: "node:20", command: ["node", "-e", "1"] });
    child.stdout.emit("data", "stdout line\n");
    child.stderr.emit("data", "stderr line\n");
    child.emit("close", 0);
    const result = await promise;
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("stdout line");
    expect(result.output).toContain("stderr line");
  });

  it("builds docker run args with --rm and --network none", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = runInSandbox({ image: "node:20", command: ["sh"] });
    child.emit("close", 0);
    await promise;
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args).toContain("run");
    expect(args).toContain("--rm");
    expect(args).toContain("--network");
    expect(args).toContain("none");
  });

  it("adds -w workdir flag when workdir is provided", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = runInSandbox({
      image: "node:20",
      command: ["sh"],
      workdir: "/workspace",
    });
    child.emit("close", 0);
    await promise;
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args).toContain("-w");
    expect(args).toContain("/workspace");
  });

  it("adds -e env flags for each env var", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = runInSandbox({
      image: "node:20",
      command: ["sh"],
      env: { FOO: "bar", BAZ: "qux" },
    });
    child.emit("close", 0);
    await promise;
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args).toContain("FOO=bar");
    expect(args).toContain("BAZ=qux");
  });

  it("adds -v mount flags with specified mode", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = runInSandbox({
      image: "node:20",
      command: ["sh"],
      mounts: [{ hostPath: "/host/path", containerPath: "/app", mode: "rw" }],
    });
    child.emit("close", 0);
    await promise;
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args).toContain("-v");
    expect(args.some((a: string) => a.includes("/host/path:/app:rw"))).toBe(true);
  });

  it("defaults mount mode to ro when not specified", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = runInSandbox({
      image: "node:20",
      command: ["sh"],
      mounts: [{ hostPath: "/h", containerPath: "/c" }],
    });
    child.emit("close", 0);
    await promise;
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args.some((a: string) => a.includes(":ro"))).toBe(true);
  });

  it("adds --volumes-from flag when volumesFrom is provided", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = runInSandbox({
      image: "node:20",
      command: ["sh"],
      volumesFrom: "my-container",
    });
    child.emit("close", 0);
    await promise;
    const args = vi.mocked(spawn).mock.calls[0][1] as string[];
    expect(args).toContain("--volumes-from");
    expect(args).toContain("my-container");
  });

  it("resolves with exitCode 1 and error message on child error event", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = runInSandbox({ image: "node:20", command: ["sh"] });
    child.emit("error", new Error("docker not found"));
    const result = await promise;
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("docker not found");
  });

  it("kills child after timeout and resolves with the close code", async () => {
    vi.useFakeTimers();
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = runInSandbox({
      image: "node:20",
      command: ["sh"],
      timeoutMs: 100,
    });
    vi.advanceTimersByTime(101);
    child.emit("close", 137);
    const result = await promise;
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(result.exitCode).toBe(137);
  });

  it("clears active timer when an error event fires before close", async () => {
    vi.useFakeTimers();
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = runInSandbox({
      image: "node:20",
      command: ["sh"],
      timeoutMs: 1000,
    });
    // Error fires before timeout expires — timer should be cleared (no SIGKILL later)
    child.emit("error", new Error("spawn error"));
    const result = await promise;
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("spawn error");
    // Advance past the timeout to confirm kill is NOT called a second time
    vi.advanceTimersByTime(2000);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("does not set timeout when timeoutMs is 0", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = runInSandbox({
      image: "node:20",
      command: ["sh"],
      timeoutMs: 0,
    });
    child.emit("close", 0);
    const result = await promise;
    expect(result.exitCode).toBe(0);
    expect(child.kill).not.toHaveBeenCalled();
  });

  it("uses exit code 1 when close code is null", async () => {
    const child = makeChild();
    vi.mocked(spawn).mockReturnValue(child);
    const promise = runInSandbox({ image: "node:20", command: ["sh"] });
    child.emit("close", null);
    const result = await promise;
    expect(result.exitCode).toBe(1);
  });
});
