import { streamToText, shellQuote } from "./shared";
import type { ToolDefinition } from "./types";
import { claimBrowserCommands, enqueueBrowserCommand, getBrowserEvents, getBrowserSessionDetail, getBrowserSessions, getFocusedBrowserSession } from "../browser-session-store";

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
    return {
      ok: result.ok,
      output: { command, launched: result.ok },
      error: result.ok ? undefined : result.stderr || "failed to launch app",
      events: context.eventState
    };
  }
};

export const browserSessionSnapshotTool: ToolDefinition = {
  name: "browser_session_snapshot",
  async execute(input, context) {
    const sessionKey = typeof input.args?.sessionKey === "string" ? input.args.sessionKey : undefined;
    return {
      ok: true,
      output: {
        sessionKey: sessionKey ?? "all",
        sessions: getBrowserSessions(sessionKey)
      },
      events: context.eventState
    };
  }
};

export const browserActiveTabTool: ToolDefinition = {
  name: "browser_active_tab",
  async execute(input, context) {
    const sessionKey = typeof input.args?.sessionKey === "string" ? input.args.sessionKey : "desktop-main";
    const session = getFocusedBrowserSession(sessionKey);

    return {
      ok: true,
      output: {
        sessionKey,
        session,
        activeTab: session?.tabs?.[0] ?? null
      },
      events: context.eventState
    };
  }
};

export const browserRecentEventsTool: ToolDefinition = {
  name: "browser_recent_events",
  async execute(input, context) {
    const sessionKey = typeof input.args?.sessionKey === "string" ? input.args.sessionKey : "desktop-main";
    const limit = typeof input.args?.limit === "number" ? input.args.limit : 10;

    return {
      ok: true,
      output: {
        sessionKey,
        events: getBrowserEvents(sessionKey, limit)
      },
      events: context.eventState
    };
  }
};

export const browserWorkspaceClaimTool: ToolDefinition = {
  name: "browser_workspace_claim",
  async execute(input, context) {
    const sessionKey = typeof input.args?.sessionKey === "string" ? input.args.sessionKey : "desktop-main";
    const artifactId = typeof input.args?.artifactId === "string" ? input.args.artifactId : "";

    return {
      ok: true,
      output: {
        sessionKey,
        artifactId,
        commands: artifactId ? claimBrowserCommands(sessionKey, artifactId) : []
      },
      events: context.eventState
    };
  }
};

export const browserWorkspaceOpenUrlTool: ToolDefinition = {
  name: "browser_workspace_open_url",
  async execute(input, context) {
    const sessionKey = typeof input.args?.sessionKey === "string" ? input.args.sessionKey : "desktop-main";
    const artifactId = typeof input.args?.artifactId === "string" ? input.args.artifactId : undefined;
    const url = typeof input.args?.url === "string" ? input.args.url : undefined;
    const newTab = input.args?.newTab === true;

    if (!url) {
      return {
        ok: false,
        error: "url is required",
        events: context.eventState
      };
    }

    const queued = enqueueBrowserCommand(
      sessionKey,
      {
        type: "open_url",
        url,
        newTab
      },
      artifactId,
    );

    if (!queued) {
      return {
        ok: false,
        error: "no browser workspace available",
        events: context.eventState
      };
    }

    return {
      ok: true,
      output: {
        sessionKey,
        artifactId: queued.artifactId,
        command: queued.command
      },
      events: context.eventState
    };
  }
};

export const browserPageSnapshotTool: ToolDefinition = {
  name: "browser_page_snapshot",
  async execute(input, context) {
    const sessionKey = typeof input.args?.sessionKey === "string" ? input.args.sessionKey : "desktop-main";
    const session = getFocusedBrowserSession(sessionKey);
    const activeTab = session?.activeTab ?? session?.tabs?.[0] ?? null;

    return {
      ok: true,
      output: {
        sessionKey,
        session,
        page: activeTab
          ? {
              title: activeTab.title ?? session?.title ?? null,
              url: activeTab.url ?? session?.activeUrl ?? null,
              previewText: activeTab.previewText ?? null,
              captureState: activeTab.captureState ?? "unavailable"
            }
          : null
      },
      events: context.eventState
    };
  }
};

export const browserWorkspaceDetailTool: ToolDefinition = {
  name: "browser_workspace_detail",
  async execute(input, context) {
    const sessionKey = typeof input.args?.sessionKey === "string" ? input.args.sessionKey : "desktop-main";
    const artifactId = typeof input.args?.artifactId === "string" ? input.args.artifactId : undefined;
    const session = getBrowserSessionDetail(sessionKey, artifactId);

    return {
      ok: true,
      output: {
        sessionKey,
        artifactId: artifactId ?? session?.artifactId ?? null,
        session
      },
      events: context.eventState
    };
  }
};
