import { streamToText } from "./shared";
import type { ToolDefinition } from "./types";

async function runShell(command: string, cwd?: string, timeoutMs = 30000) {
  const proc = Bun.spawn(["sh", "-lc", command], {
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  const exitCode = await proc.exited;
  clearTimeout(timeout);

  const [stdout, stderr] = await Promise.all([
    streamToText(proc.stdout),
    streamToText(proc.stderr)
  ]);

  return {
    ok: !timedOut && exitCode === 0,
    exitCode,
    stdout,
    stderr,
    timedOut
  };
}

export const shellTool: ToolDefinition = {
  name: "shell_exec",
  requiresConfirmation(input) {
    const command = String(input.args?.cmd ?? "");
    const risky = /(\brm\b|\bdd\b|\bmkfs\b|\bshutdown\b|\breboot\b|\bpoweroff\b|systemctl\s+(stop|disable|mask)|\bmv\b\s+.+\s+\/(etc|usr|bin|sbin|lib)|\bchmod\b\s+-R|\bchown\b\s+-R)/;
    if (!risky.test(command)) {
      return undefined;
    }

    return {
      title: "Confirm shell command",
      message: `This shell command looks potentially destructive: ${command}`
    };
  },
  async execute(input, context) {
    const command = String(input.args?.cmd ?? "");
    const cwd = typeof input.args?.cwd === "string" ? input.args.cwd : undefined;
    const timeoutMs = typeof input.options?.timeoutMs === "number" ? input.options.timeoutMs : 30000;
    const result = await runShell(command, cwd, timeoutMs);

    return {
      ok: result.ok,
      output: result,
      error: result.ok ? undefined : result.timedOut ? "command timed out" : result.stderr || `command exited with ${result.exitCode}`,
      events: context.eventState
    };
  }
};
