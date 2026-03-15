import { execCommand } from "./exec";
import type { ToolDefinition } from "./types";

export const shellTool: ToolDefinition = {
  name: "shell_exec",
  requiresConfirmation(input) {
    const command = String(input.args?.cmd ?? "");
    const runAs = input.options?.runAs;

    if (runAs === "root") {
      return {
        title: "Confirm root shell command",
        message: `This command will run with elevated privileges via pkexec: ${command}`
      };
    }

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
    const asRoot = input.options?.runAs === "root";
    const result = await execCommand(command, { asRoot, cwd, timeoutMs });

    return {
      ok: result.ok,
      output: result,
      error: result.ok ? undefined : result.timedOut ? "command timed out" : result.stderr || `command exited with ${result.exitCode}`,
      events: context.eventState
    };
  }
};
