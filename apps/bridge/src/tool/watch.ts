import type { ToolDefinition } from "./types";

type Watch = {
  id: string;
  cmd: string;
  label: string;
  createdAt: number;
  process: ReturnType<typeof Bun.spawn>;
  onFire: (result: { stdout: string; stderr: string; exitCode: number }) => void;
};

const activeWatches = new Map<string, Watch>();

export function setWatchCallback(callback: (watchId: string, label: string, result: { stdout: string; stderr: string; exitCode: number }) => void) {
  onFireCallback = callback;
}

let onFireCallback: ((watchId: string, label: string, result: { stdout: string; stderr: string; exitCode: number }) => void) | null = null;

export const watchTool: ToolDefinition = {
  name: "watch",
  async execute(input, context) {
    const cmd = String(input.args?.cmd ?? "");
    const label = typeof input.args?.label === "string" ? input.args.label : cmd.slice(0, 60);

    if (!cmd) {
      return { ok: false, error: "cmd is required", events: context.eventState };
    }

    const watchId = `watch-${crypto.randomUUID().slice(0, 8)}`;

    const proc = Bun.spawn(["bash", "-c", cmd], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, HOME: process.env.HOME ?? "/home/n" }
    });

    const watch: Watch = {
      id: watchId,
      cmd,
      label,
      createdAt: Date.now(),
      process: proc,
      onFire: () => {}
    };

    activeWatches.set(watchId, watch);

    // Background: wait for process to exit, then fire
    void (async () => {
      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      activeWatches.delete(watchId);

      if (onFireCallback) {
        onFireCallback(watchId, label, { stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
      }
    })();

    return {
      ok: true,
      output: { watchId, label, cmd, message: `Watch started. A new turn will fire when the command exits.` },
      events: context.eventState
    };
  }
};

export const watchListTool: ToolDefinition = {
  name: "watch_list",
  async execute(_input, context) {
    const watches = Array.from(activeWatches.values()).map((w) => ({
      id: w.id,
      cmd: w.cmd,
      label: w.label,
      createdAt: w.createdAt,
      elapsedMs: Date.now() - w.createdAt
    }));

    return {
      ok: true,
      output: { watches, count: watches.length },
      events: context.eventState
    };
  }
};

export const watchCancelTool: ToolDefinition = {
  name: "watch_cancel",
  async execute(input, context) {
    const watchId = String(input.args?.watchId ?? "");
    const watch = activeWatches.get(watchId);

    if (!watch) {
      return { ok: false, error: `no active watch with id ${watchId}`, events: context.eventState };
    }

    watch.process.kill();
    activeWatches.delete(watchId);

    return {
      ok: true,
      output: { cancelled: watchId, label: watch.label },
      events: context.eventState
    };
  }
};
