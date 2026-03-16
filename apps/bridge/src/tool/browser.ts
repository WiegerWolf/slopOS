import { streamToText, shellQuote } from "./shared";
import type { ToolDefinition } from "./types";
import { trackLaunchedProcess, getLaunchedProcesses, listDesktopApps } from "../adapter/apps";

async function launchDetached(command: string) {
  const proc = Bun.spawn(["sh", "-lc", `${command} >/tmp/slopos-launch.log 2>&1 &`], {
    stdout: "ignore",
    stderr: "pipe"
  });

  const exitCode = await proc.exited;
  const stderr = await streamToText(proc.stderr);

  return {
    ok: exitCode === 0,
    exitCode,
    pid: proc.pid,
    stderr
  };
}

export const browserOpenTool: ToolDefinition = {
  name: "browser_open",
  async execute(input, context) {
    const url = String(input.args?.url ?? "");
    const result = await launchDetached(`xdg-open ${shellQuote(url)}`);
    return {
      ok: result.ok,
      output: { url, launched: result.ok },
      error: result.ok ? undefined : result.stderr || "failed to launch browser",
      events: context.eventState
    };
  }
};

export const appLaunchTool: ToolDefinition = {
  name: "app_launch",
  async execute(input, context) {
    const command = String(input.args?.command ?? "");
    const result = await launchDetached(command);

    if (result.ok && result.pid) {
      const id = `app-${crypto.randomUUID().slice(0, 8)}`;
      trackLaunchedProcess(id, result.pid, command);
    }

    return {
      ok: result.ok,
      output: { command, launched: result.ok, pid: result.pid },
      error: result.ok ? undefined : result.stderr || "failed to launch app",
      events: context.eventState
    };
  }
};

export const appListTool: ToolDefinition = {
  name: "app_list",
  async execute(_input, context) {
    const [desktopApps, launched] = await Promise.all([
      listDesktopApps(),
      Promise.resolve(getLaunchedProcesses())
    ]);

    return {
      ok: true,
      output: {
        desktopApps,
        launchedProcesses: launched
      },
      events: context.eventState
    };
  }
};
