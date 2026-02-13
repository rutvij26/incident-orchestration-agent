export type SandboxCommand = {
  image: string;
  command: string[];
  timeoutMs?: number;
};

export async function runInSandbox(
  _command: SandboxCommand
): Promise<{ exitCode: number; output: string }> {
  return {
    exitCode: 1,
    output:
      "Sandbox execution not wired yet. Use docker run in a locked-down container.",
  };
}
