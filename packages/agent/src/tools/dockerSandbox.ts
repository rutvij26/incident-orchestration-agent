export type SandboxCommand = {
  image: string;
  command: string[];
  timeoutMs?: number;
  workdir?: string;
  env?: Record<string, string>;
  mounts?: Array<{ hostPath: string; containerPath: string; mode?: "ro" | "rw" }>;
  volumesFrom?: string;
};

export async function runInSandbox(
  command: SandboxCommand,
): Promise<{ exitCode: number; output: string }> {
  const { spawn } = await import("node:child_process");

  const args: string[] = ["run", "--rm", "--network", "none"];
  if (command.workdir) {
    args.push("-w", command.workdir);
  }
  if (command.env) {
    for (const [key, value] of Object.entries(command.env)) {
      args.push("-e", `${key}=${value}`);
    }
  }
  if (command.mounts) {
    for (const mount of command.mounts) {
      const mode = mount.mode ?? "ro";
      args.push("-v", `${mount.hostPath}:${mount.containerPath}:${mode}`);
    }
  }
  if (command.volumesFrom) {
    args.push("--volumes-from", command.volumesFrom);
  }
  args.push(command.image, ...command.command);

  return new Promise((resolve) => {
    const child = spawn("docker", args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const timer =
      command.timeoutMs && command.timeoutMs > 0
        ? setTimeout(() => {
            child.kill("SIGKILL");
          }, command.timeoutMs)
        : null;

    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.on("close", (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolve({ exitCode: code ?? 1, output });
    });
    child.on("error", (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      resolve({ exitCode: 1, output: String(error) });
    });
  });
}
