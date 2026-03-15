import type { AgentTurnResponse, Operation, RetentionMode, Task } from "@slopos/runtime";
import { coreSurfaceDescriptors, isExistingModuleId, type ExistingModuleId } from "@slopos/runtime";

type RuntimeSurfaceSpec = {
  title?: string;
  subtitle?: string;
  headline?: string;
  body?: string;
  badges?: Array<{ label: string; tone?: "accent" | "muted" | "secondary" | "primary" }>;
  facts?: Array<{ label: string; value: string }>;
  sections?: Array<{ title: string; lines: string[] }>;
  primaryUrl?: string;
  shellCommand?: string;
  readPath?: string;
};

export type AgentToolCall = {
  name: string;
  args?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

export type PlannerSpec = {
  statusText: string;
  summaryTitle: string;
  summaryLine: string;
  surface: {
    kind: "existing" | "runtime" | "browser";
    moduleId?: ExistingModuleId;
    title: string;
    retention: RetentionMode;
    url?: string;
    data?: Record<string, unknown>;
    runtime?: RuntimeSurfaceSpec;
  };
};

export type PlannerRuntimeContext = {
  iteration?: number;
  statusText?: string;
  recentHistory?: Array<{
    kind: string;
    taskId: string;
    summary: string;
  }>;
  visibleArtifacts?: Array<{
    id: string;
    title: string;
    type: string;
    retention: string;
    moduleId?: string;
    currentUrl?: string;
    tabCount?: number;
    sessionSummary?: string;
  }>;
  activeTasks?: Array<{
    id: string;
    intent: string;
    status: string;
    summary?: string;
  }>;
  chronicle?: Array<{
    id: string;
    title: string;
    oneLine: string;
    status: string;
  }>;
  systemEvents?: Record<string, unknown>;
  toolResults?: Array<{
    name: string;
    ok: boolean;
    output?: unknown;
    error?: string;
  }>;
};

export type AgentStep =
  | {
      kind: "tool_calls";
      statusText: string;
      calls: AgentToolCall[];
    }
  | {
      kind: "final";
      spec: PlannerSpec;
    };

function escapeForTemplate(value: string) {
  return JSON.stringify(value);
}

export function runtimeSurfaceCode(intent: string, runtime: RuntimeSurfaceSpec = {}) {
  const safeIntent = escapeForTemplate(intent);
  const safeRuntime = JSON.stringify(runtime);
  const safePrimaryUrl = escapeForTemplate(runtime.primaryUrl ?? "https://open.spotify.com");
  const safeShellCommand = escapeForTemplate(runtime.shellCommand ?? "pwd");
  const safeReadPath = escapeForTemplate(runtime.readPath ?? "/home/n/slopos/README.md");
  const safeWorkspace = escapeForTemplate("/home/n/slopos");

  return `import React from "react";
import { Badge, Button, Card, Column, FactGrid, Row, SectionList, Text } from "@slopos/ui";
import { useHost, type SurfaceProps } from "@slopos/host";

export const surface = {
  id: "runtime-surface",
  title: "Runtime Surface",
  version: "0.1.0",
  preferredPlacement: "center",
  defaultRetention: "pinned"
} as const;

const defaultRuntime = ${safeRuntime};

export default function RuntimeSurface(props: SurfaceProps<{ intent?: string; primaryUrl?: string; runtime?: Record<string, unknown>; restoredFromPersistence?: boolean; restoreStrategy?: string }>) {
  const host = useHost();
  const effectiveIntent = props.data?.intent ?? ${safeIntent};
  const runtime = {
    ...defaultRuntime,
    ...(props.data?.runtime ?? {})
  } as {
    title?: string;
    subtitle?: string;
    headline?: string;
    body?: string;
    badges?: Array<{ label: string; tone?: "accent" | "muted" | "secondary" | "primary" }>;
    facts?: Array<{ label: string; value: string }>;
    sections?: Array<{ title: string; lines: string[] }>;
  };

  return (
    <Card title={runtime.title ?? "Runtime Workspace"} subtitle={runtime.subtitle ?? "This TSX file was written by the local bridge at request time."}>
      <Column gap={14}>
        {props.data?.restoredFromPersistence ? (
          <Row gap={10}>
            <Badge tone="muted">restored</Badge>
            {props.data?.restoreStrategy ? <Text tone="muted">strategy: {props.data.restoreStrategy}</Text> : null}
          </Row>
        ) : null}
        <Text>{runtime.headline ?? "Current intent"}: {effectiveIntent}</Text>
        {runtime.body ? <Text tone="muted">{runtime.body}</Text> : null}
        <Row gap={10}>
          <Badge tone="accent">agent-written TSX</Badge>
          <Badge tone="muted">direct host tools</Badge>
          {(runtime.badges ?? []).map((badge) => (
            <Badge key={badge.label} tone={badge.tone ?? "muted"}>{badge.label}</Badge>
          ))}
        </Row>
        <FactGrid items={runtime.facts ?? []} />
        <SectionList sections={runtime.sections ?? []} />
        <Row gap={10}>
          <Button
            onClick={() =>
              host.tool(
                "browser_open",
                { url: props.data?.primaryUrl ?? ${safePrimaryUrl} },
                { runAs: "user" }
              )
            }
          >
            Open Web Surface
          </Button>
          <Button
            tone="secondary"
            onClick={async () => {
              const result = await host.tool<{ stdout?: string }>(
                "shell_exec",
                { cmd: ${safeShellCommand}, cwd: ${safeWorkspace} },
                { runAs: "user", timeoutMs: 5000 }
              );
              host.logStatus(result.stdout?.trim() || "shell command finished");
            }}
          >
            Run Shell Action
          </Button>
          <Button
            tone="secondary"
            onClick={async () => {
              const result = await host.tool<{ content?: string }>(
                "fs_read",
                { path: ${safeReadPath} },
                { runAs: "user" }
              );
              host.logStatus(result.content ? "Read file from disk" : "File was empty");
            }}
          >
            Read File
          </Button>
        </Row>
      </Column>
    </Card>
  );
}
`;
}

function sanitizeRetention(input: unknown, fallback: RetentionMode = "pinned"): RetentionMode {
  return input === "ephemeral" || input === "collapsed" || input === "persistent" || input === "pinned" || input === "background"
    ? input
    : fallback;
}

function sanitizeExistingModuleId(input: unknown): ExistingModuleId | undefined {
  return isExistingModuleId(input) ? input : undefined;
}

function buildExistingSurfaceData(moduleId: ExistingModuleId, task: Task, input?: Record<string, unknown>) {
  if (moduleId === "audio-mixer") {
    return {};
  }

  if (moduleId === "network-panel") {
    return {};
  }

  if (moduleId === "panic-overlay") {
    return {};
  }

  if (moduleId === "bluetooth-connect-flow") {
    return {
      deviceHint: typeof input?.deviceHint === "string" ? input.deviceHint : "Sony headset likely to appear first"
    };
  }

  if (moduleId === "terminal-surface") {
    return {
      cwd: typeof input?.cwd === "string" ? input.cwd : "/home/n/slopos",
      title: typeof input?.title === "string" ? input.title : "Terminal Workspace",
      command: typeof input?.command === "string" ? input.command : undefined
    };
  }

  if (moduleId === "session-inspector") {
    return {
      sessionKey: typeof input?.sessionKey === "string" ? input.sessionKey : "desktop-main",
      initialSnapshot: input?.initialSnapshot
    };
  }

  if (moduleId === "browser-inspector") {
    return {
      sessionKey: typeof input?.sessionKey === "string" ? input.sessionKey : "desktop-main",
      initialSnapshot: input?.initialSnapshot
    };
  }

  if (moduleId === "diagnostics-inspector") {
    return {
      sessionKey: typeof input?.sessionKey === "string" ? input.sessionKey : "desktop-main",
      initialSnapshot: input?.initialSnapshot
    };
  }

  return {
    repo: typeof input?.repo === "string" ? input.repo : "/home/n/slopos",
    docsUrl: typeof input?.docsUrl === "string" ? input.docsUrl : "https://vite.dev/guide/"
  };
}

function buildResponseFromSpec(task: Task, spec: PlannerSpec): AgentTurnResponse {
  const operations: Operation[] = [
    {
      type: "set_task_status",
      status: "running",
      statusText: spec.statusText
    }
  ];

  if (spec.surface.kind === "existing") {
    const moduleId = sanitizeExistingModuleId(spec.surface.moduleId) ?? "coding-workspace";
    operations.push({
      type: "create_artifact",
      artifact: {
        id: `${task.id}-${moduleId}`,
        artifactType: "surface",
        title: spec.surface.title,
        renderer: "tsx",
        retention: sanitizeRetention(spec.surface.retention),
        placement: "center",
        payload: {
          moduleId,
          data: buildExistingSurfaceData(moduleId, task, spec.surface.data)
        }
      }
    });
  } else if (spec.surface.kind === "runtime") {
    operations.push(
      {
        type: "write_surface_module",
        module: {
          id: "runtime-surface",
          path: "apps/shell/src/generated-runtime/runtime-surface.tsx",
          code: runtimeSurfaceCode(task.intent, spec.surface.runtime)
        }
      },
      {
        type: "create_artifact",
        artifact: {
          id: `${task.id}-runtime-surface`,
          artifactType: "surface",
          title: spec.surface.title,
          renderer: "tsx",
          retention: sanitizeRetention(spec.surface.retention),
          placement: "center",
          payload: {
            moduleId: "runtime-surface",
            data: {
              intent: task.intent,
              primaryUrl: spec.surface.runtime?.primaryUrl ?? "https://open.spotify.com",
              runtime: spec.surface.runtime ?? {}
            }
          }
        }
      }
    );
  } else {
    operations.push({
      type: "create_artifact",
      artifact: {
        id: `${task.id}-browser-artifact`,
        artifactType: "browser",
        title: spec.surface.title,
        renderer: "native",
        retention: sanitizeRetention(spec.surface.retention),
        placement: "center",
        payload: {
          title: spec.surface.title,
          url: spec.surface.url ?? "https://vite.dev/guide/"
        }
      }
    });
  }

  operations.push({
    type: "complete_task",
    summary: {
      title: spec.summaryTitle,
      oneLine: spec.summaryLine
    }
  });

  return {
    taskId: task.id,
    intent: task.intent,
    mode: "foreground",
    statusText: spec.statusText,
    operations
  };
}

function makeSummaryTitle(intent: string) {
  if (intent.toLowerCase().includes("music") || intent.toLowerCase().includes("spotify")) {
    return "Prepared music workspace";
  }

  if (intent.toLowerCase().includes("bluetooth") || intent.toLowerCase().includes("headset")) {
    return "Connect Bluetooth headset";
  }

  if (intent.toLowerCase().includes("volume") || intent.toLowerCase().includes("audio") || intent.toLowerCase().includes("sound")) {
    return "Opened audio mixer";
  }

  if (intent.toLowerCase().includes("wifi") || intent.toLowerCase().includes("network")) {
    return "Opened network panel";
  }

  if (intent.toLowerCase().includes("code") || intent.toLowerCase().includes("coding")) {
    return "Prepared coding workspace";
  }

  if (intent.toLowerCase().includes("terminal") || intent.toLowerCase().includes("shell")) {
    return "Opened terminal workspace";
  }

  return "Prepared runtime workspace";
}

function inferBrowserUrl(intent: string) {
  const normalized = intent.toLowerCase();
  if (normalized.includes("openai")) {
    return "https://openai.com";
  }
  if (normalized.includes("github")) {
    return "https://github.com";
  }
  if (normalized.includes("spotify")) {
    return "https://open.spotify.com";
  }
  if (normalized.includes("vite")) {
    return "https://vite.dev/guide/";
  }
  return null;
}

export function heuristicNextAgentStep(task: Task, context?: PlannerRuntimeContext): AgentStep {
  const normalized = task.intent.toLowerCase();
  const focusedModule = context?.visibleArtifacts?.[0]?.moduleId;
  const toolResults = context?.toolResults ?? [];
  const hasToolResults = toolResults.length > 0;
  const iteration = context?.iteration ?? 0;
  const recentSummary = [...(context?.recentHistory ?? [])]
    .reverse()
    .find((entry) => entry.kind === "summary")
    ?.summary?.toLowerCase() ?? "";

  if ((normalized.includes("continue") || normalized.includes("what i was doing") || normalized.includes("keep going")) && focusedModule) {
    if (focusedModule === "terminal-surface") {
      return {
        kind: "final",
        spec: {
          statusText: "Reopening the live terminal surface",
          summaryTitle: "Continued terminal workspace",
          summaryLine: "Kept the existing terminal-style workflow in focus for the next command.",
          surface: {
            kind: "existing",
            moduleId: "terminal-surface",
            title: context.visibleArtifacts?.[0]?.title ?? "Terminal",
            retention: "pinned",
            data: {
              cwd: "/home/n/slopos",
              title: context.visibleArtifacts?.[0]?.title ?? "Terminal Workspace"
            }
          }
        }
      };
    }

    if (focusedModule === "coding-workspace") {
      return {
        kind: "final",
        spec: {
          statusText: "Continuing your coding workspace",
          summaryTitle: "Continued coding workspace",
          summaryLine: "Kept the coding surface visible so you can continue where you left off.",
          surface: {
            kind: "existing",
            moduleId: "coding-workspace",
            title: context.visibleArtifacts?.[0]?.title ?? "Coding Workspace",
            retention: "pinned",
            data: {
              repo: "/home/n/slopos",
              docsUrl: "https://vite.dev/guide/"
            }
          }
        }
      };
    }
  }

  if ((normalized.includes("continue") || normalized.includes("what i was doing") || normalized.includes("keep going")) && context?.visibleArtifacts?.[0]?.type === "browser") {
    return {
      kind: "final",
      spec: {
        statusText: "Continuing your browser workspace",
        summaryTitle: "Continued browser workspace",
        summaryLine: "Restored the current browser pane from visible shell context.",
        surface: {
          kind: "browser",
          title: context.visibleArtifacts[0].title || "Browser",
          retention: "pinned",
          url: context.visibleArtifacts[0].currentUrl ?? "https://vite.dev/guide/",
          data: {
            sessionSummary: context.visibleArtifacts[0].sessionSummary,
            tabCount: context.visibleArtifacts[0].tabCount
          }
        }
      }
    };
  }

  if ((normalized.includes("continue") || normalized.includes("what i was doing") || normalized.includes("keep going")) && recentSummary.includes("analyzed repository")) {
    return {
      kind: "final",
      spec: {
        statusText: "Continuing the repository analysis",
        summaryTitle: "Continued repository analysis",
        summaryLine: "Used recent bridge history to restore the repo-analysis style workspace.",
        surface: {
          kind: "runtime",
          title: "Repository Analysis",
          retention: "pinned",
          runtime: {
            title: "Repository Analysis",
            subtitle: "Restored from recent turn history.",
            headline: "Continuation intent",
            body: "The bridge recognized your recent repository analysis work and brought back a matching surface.",
            primaryUrl: "https://vite.dev/guide/",
            shellCommand: "ls",
            readPath: "/home/n/slopos/README.md"
          }
        }
      }
    };
  }

  if ((normalized.includes("continue") || normalized.includes("what i was doing") || normalized.includes("keep going")) && recentSummary.includes("coding workspace")) {
    return {
      kind: "final",
      spec: {
        statusText: "Continuing your coding workspace",
        summaryTitle: "Continued coding workspace",
        summaryLine: "Used recent bridge history to restore the coding workspace.",
        surface: {
          kind: "existing",
          moduleId: "coding-workspace",
          title: "Coding Workspace",
          retention: "pinned",
          data: {
            repo: "/home/n/slopos",
            docsUrl: "https://vite.dev/guide/"
          }
        }
      }
    };
  }

  if (normalized.includes("volume") || normalized.includes("mute") || normalized.includes("sound") || normalized.includes("audio") || normalized.includes("speaker")) {
    return {
      kind: "final",
      spec: {
        statusText: "Opening the audio mixer",
        summaryTitle: "Opened audio mixer",
        summaryLine: "Surfaced the audio mixer for volume and device control.",
        surface: {
          kind: "existing",
          moduleId: "audio-mixer",
          title: coreSurfaceDescriptors["audio-mixer"].title,
          retention: "pinned"
        }
      }
    };
  }

  if (normalized.includes("wifi") || normalized.includes("network") || normalized.includes("internet") || normalized.includes("connect to")) {
    return {
      kind: "final",
      spec: {
        statusText: "Opening the network panel",
        summaryTitle: "Opened network panel",
        summaryLine: "Surfaced the network panel for connection management.",
        surface: {
          kind: "existing",
          moduleId: "network-panel",
          title: coreSurfaceDescriptors["network-panel"].title,
          retention: "pinned"
        }
      }
    };
  }

  if (normalized.includes("bluetooth") || normalized.includes("headset")) {
    return {
      kind: "final",
      spec: {
        statusText: "Scanning for nearby headsets",
        summaryTitle: makeSummaryTitle(task.intent),
        summaryLine: "Generated a pairing surface and waited for direct device action.",
        surface: {
          kind: "existing",
          moduleId: "bluetooth-connect-flow",
          title: coreSurfaceDescriptors["bluetooth-connect-flow"].title,
          retention: "ephemeral",
          data: {
            deviceHint: "Sony headset likely to appear first"
          }
        }
      }
    };
  }

  if (normalized.includes("music") || normalized.includes("spotify") || normalized.includes("playlist")) {
    return {
      kind: "final",
      spec: {
        statusText: "Generating a disposable music surface",
        summaryTitle: makeSummaryTitle(task.intent),
        summaryLine: "Wrote a TSX surface at runtime and left it pinned for the next command.",
        surface: {
          kind: "runtime",
          title: "Runtime Workspace",
          retention: "pinned",
          runtime: {
            title: "Runtime Workspace",
            subtitle: "This TSX file was written by the local bridge at request time.",
            headline: "Current intent",
            body: "In the real system, the cloud model would produce this surface code on the fly. For now, the bridge writes a task-specific module and Vite hot reloads it.",
            primaryUrl: "https://open.spotify.com",
            shellCommand: "pwd",
            readPath: "/home/n/slopos/README.md"
          }
        }
      }
    };
  }

  if (normalized.includes("what page") || normalized.includes("browser session") || normalized.includes("what do i have open") || normalized.includes("summarize browser")) {
    if (!hasToolResults) {
      return {
        kind: "tool_calls",
        statusText: "Inspecting browser session state",
        calls: [
          {
            name: "browser_session_snapshot",
            args: {
              sessionKey: "desktop-main"
            },
            options: {
              runAs: "user"
            }
          }
        ]
      };
    }

    const latestBrowserTool = toolResults[toolResults.length - 1];
    const snapshot = latestBrowserTool?.output as {
      sessions?: Array<{
        artifactId?: string;
        title?: string;
        activeUrl?: string;
        tabCount?: number;
        sessionSummary?: string;
        tabs?: Array<{ title?: string; url?: string }>;
      }>;
    } | undefined;
    const sessions = snapshot?.sessions ?? [];
    const primary = sessions[0];

    return {
      kind: "final",
      spec: {
        statusText: "Summarizing browser session",
        summaryTitle: "Observed browser session",
        summaryLine: "Inspected the current embedded browser workspace before generating a summary surface.",
        surface: {
          kind: "existing",
          moduleId: "browser-inspector",
          title: coreSurfaceDescriptors["browser-inspector"].title,
          retention: "pinned",
          data: {
            sessionKey: "desktop-main",
            initialSnapshot: {
              sessionKey: "desktop-main",
              sessions: sessions.map((session) => ({
                artifactId: session.artifactId,
                title: session.title,
                activeUrl: session.activeUrl,
                tabCount: session.tabCount,
                sessionSummary: session.sessionSummary,
                tabs: session.tabs
              }))
            }
          }
        }
      }
    };
  }

  if (normalized.includes("what changed in browser") || normalized.includes("recent browser activity") || normalized.includes("recent browser events")) {
    if (!hasToolResults) {
      return {
        kind: "tool_calls",
        statusText: "Inspecting recent browser activity",
        calls: [
          {
            name: "browser_recent_events",
            args: {
              sessionKey: "desktop-main",
              limit: 8
            },
            options: {
              runAs: "user"
            }
          },
          {
            name: "browser_session_snapshot",
            args: {
              sessionKey: "desktop-main"
            },
            options: {
              runAs: "user"
            }
          }
        ]
      };
    }

    const snapshotTool = toolResults.find((result) => result.name === "browser_session_snapshot");
    const eventsTool = toolResults.find((result) => result.name === "browser_recent_events");
    const snapshot = snapshotTool?.output as {
      sessions?: Array<{
        artifactId?: string;
        title?: string;
        activeUrl?: string;
        tabCount?: number;
        sessionSummary?: string;
        activeTab?: { id?: string; title?: string; url?: string; previewText?: string; captureState?: "available" | "unavailable" };
        tabs?: Array<{ id?: string; title?: string; url?: string; previewText?: string; captureState?: "available" | "unavailable" }>;
      }>;
    } | undefined;
    const events = (eventsTool?.output as { events?: Array<unknown> } | undefined)?.events ?? [];

    return {
      kind: "final",
      spec: {
        statusText: "Opening browser activity inspector",
        summaryTitle: "Observed recent browser activity",
        summaryLine: "Inspected recent browser page-state events before opening the browser inspector.",
        surface: {
          kind: "existing",
          moduleId: "browser-inspector",
          title: coreSurfaceDescriptors["browser-inspector"].title,
          retention: "pinned",
          data: {
            sessionKey: "desktop-main",
            initialSnapshot: {
              sessionKey: "desktop-main",
              sessions: snapshot?.sessions ?? [],
              recentEvents: events
            }
          }
        }
      }
    };
  }

  if (normalized.includes("what tab am i on") || normalized.includes("active tab") || normalized.includes("focused tab")) {
    if (!hasToolResults) {
      return {
        kind: "tool_calls",
        statusText: "Inspecting the focused browser tab",
        calls: [
          {
            name: "browser_active_tab",
            args: {
              sessionKey: "desktop-main"
            },
            options: {
              runAs: "user"
            }
          }
        ]
      };
    }

    const latestTabTool = toolResults[toolResults.length - 1];
    const snapshot = latestTabTool?.output as {
      session?: {
        artifactId?: string;
        title?: string;
        activeUrl?: string;
        tabCount?: number;
        sessionSummary?: string;
        tabs?: Array<{ id?: string; title?: string; url?: string }>;
      } | null;
      activeTab?: { id?: string; title?: string; url?: string } | null;
    } | undefined;
    const session = snapshot?.session;

    return {
      kind: "final",
      spec: {
        statusText: "Summarizing focused browser tab",
        summaryTitle: "Observed focused browser tab",
        summaryLine: "Inspected the focused browser tab before opening a persistent browser inspector.",
        surface: {
          kind: "existing",
          moduleId: "browser-inspector",
          title: coreSurfaceDescriptors["browser-inspector"].title,
          retention: "pinned",
          data: {
            sessionKey: "desktop-main",
            initialSnapshot: {
              sessionKey: "desktop-main",
              sessions: session ? [session] : []
            }
          }
        }
      }
    };
  }

  if ((normalized.includes("open ") || normalized.includes("navigate ")) && normalized.includes("browser")) {
    const targetUrl = inferBrowserUrl(task.intent) ?? "https://vite.dev/guide/";

    if (!hasToolResults) {
      return {
        kind: "tool_calls",
        statusText: "Sending a navigation command to the browser workspace",
        calls: [
          {
            name: "browser_workspace_open_url",
            args: {
              sessionKey: "desktop-main",
              url: targetUrl,
              newTab: normalized.includes("new tab")
            },
            options: {
              runAs: "user"
            }
          }
        ]
      };
    }

    return {
      kind: "final",
      spec: {
        statusText: "Updating browser workspace",
        summaryTitle: "Updated browser workspace",
        summaryLine: `Queued navigation to ${targetUrl} inside the current browser workspace.`,
        surface: {
          kind: "existing",
          moduleId: "browser-inspector",
          title: coreSurfaceDescriptors["browser-inspector"].title,
          retention: "pinned",
          data: {
            sessionKey: "desktop-main"
          }
        }
      }
    };
  }

  if (normalized.includes("what does this page say") || normalized.includes("summarize current page") || normalized.includes("read this page")) {
    if (!hasToolResults) {
      return {
        kind: "tool_calls",
        statusText: "Capturing the focused page snapshot",
        calls: [
          {
            name: "browser_page_snapshot",
            args: {
              sessionKey: "desktop-main"
            },
            options: {
              runAs: "user"
            }
          }
        ]
      };
    }

    const latestPageTool = toolResults[toolResults.length - 1];
    const snapshot = latestPageTool?.output as {
      session?: {
        artifactId?: string;
        title?: string;
        activeUrl?: string;
        tabCount?: number;
        sessionSummary?: string;
        activeTab?: {
          id?: string;
          title?: string;
          url?: string;
          previewText?: string;
          captureState?: "available" | "unavailable";
        };
        tabs?: Array<{ id?: string; title?: string; url?: string; previewText?: string; captureState?: "available" | "unavailable" }>;
      } | null;
      page?: {
        title?: string | null;
        url?: string | null;
        previewText?: string | null;
        captureState?: "available" | "unavailable";
      } | null;
    } | undefined;
    const session = snapshot?.session;
    const page = snapshot?.page;

    return {
      kind: "final",
      spec: {
        statusText: "Opening page-aware browser inspector",
        summaryTitle: "Observed page snapshot",
        summaryLine: page?.captureState === "available"
          ? "Captured visible page preview text and opened the browser inspector around it."
          : "Inspected the focused page metadata and opened the browser inspector with the latest browser state.",
        surface: {
          kind: "existing",
          moduleId: "browser-inspector",
          title: coreSurfaceDescriptors["browser-inspector"].title,
          retention: "pinned",
          data: {
            sessionKey: "desktop-main",
            initialSnapshot: {
              sessionKey: "desktop-main",
              sessions: session ? [session] : []
            }
          }
        }
      }
    };
  }

  if (normalized.includes("inspect browser workspace") || normalized.includes("browser workspace detail") || normalized.includes("inspect focused browser")) {
    if (!hasToolResults) {
      return {
        kind: "tool_calls",
        statusText: "Inspecting the focused browser workspace",
        calls: [
          {
            name: "browser_workspace_detail",
            args: {
              sessionKey: "desktop-main"
            },
            options: {
              runAs: "user"
            }
          }
        ]
      };
    }

    const latestWorkspaceTool = toolResults[toolResults.length - 1];
    const snapshot = latestWorkspaceTool?.output as {
      session?: {
        artifactId?: string;
        title?: string;
        activeUrl?: string;
        tabCount?: number;
        sessionSummary?: string;
        tabs?: Array<{ id?: string; title?: string; url?: string }>;
      } | null;
    } | undefined;
    const session = snapshot?.session;

    return {
      kind: "final",
      spec: {
        statusText: "Opening detailed browser workspace inspector",
        summaryTitle: "Observed browser workspace detail",
        summaryLine: "Inspected a specific browser workspace before opening a persistent browser inspector.",
        surface: {
          kind: "existing",
          moduleId: "browser-inspector",
          title: coreSurfaceDescriptors["browser-inspector"].title,
          retention: "pinned",
          data: {
            sessionKey: "desktop-main",
            initialSnapshot: {
              sessionKey: "desktop-main",
              sessions: session ? [session] : []
            }
          }
        }
      }
    };
  }

  if (normalized.includes("inspect slopos session") || normalized.includes("what's on screen") || normalized.includes("what is on screen") || normalized.includes("show current artifacts") || normalized.includes("inspect session state")) {
    if (!hasToolResults) {
      return {
        kind: "tool_calls",
        statusText: "Inspecting current slopOS session state",
        calls: [
          {
            name: "slopos_session_snapshot",
            args: {
              sessionKey: "desktop-main"
            },
            options: {
              runAs: "user"
            }
          }
        ]
      };
    }

    const latestSessionTool = toolResults[toolResults.length - 1];
    const snapshot = latestSessionTool?.output as {
      session?: {
        statusText?: string;
        artifacts?: Array<{ title?: string; type?: string; retention?: string; sessionSummary?: string; currentUrl?: string }>;
        chronicle?: Array<{ title?: string; oneLine?: string; status?: string }>;
        confirmations?: Array<{ title?: string; status?: string; source?: string }>;
      } | null;
    } | undefined;
    const session = snapshot?.session;
    const artifacts = session?.artifacts ?? [];
    const chronicle = session?.chronicle ?? [];
    const confirmations = session?.confirmations ?? [];

    return {
      kind: "final",
      spec: {
        statusText: "Summarizing current slopOS session",
        summaryTitle: "Observed slopOS session",
        summaryLine: "Inspected the current shell-visible session state before generating a summary surface.",
        surface: {
          kind: "existing",
          moduleId: "session-inspector",
          title: coreSurfaceDescriptors["session-inspector"].title,
          retention: "pinned",
          data: {
            sessionKey: "desktop-main",
            initialSnapshot: {
              sessionKey: "desktop-main",
              session: session ?? null
            }
          }
        }
      }
    };
  }

  if (normalized.includes("inspect slopos runtime") || normalized.includes("show protocol versions") || normalized.includes("debug bridge state") || normalized.includes("show diagnostics")) {
    if (!hasToolResults) {
      return {
        kind: "tool_calls",
        statusText: "Inspecting bridge diagnostics",
        calls: [
          {
            name: "slopos_runtime_diagnostics",
            args: {
              sessionKey: "desktop-main"
            },
            options: {
              runAs: "user"
            }
          }
        ]
      };
    }

    const latestDiagnosticsTool = toolResults[toolResults.length - 1];
    const snapshot = latestDiagnosticsTool?.output;

    return {
      kind: "final",
      spec: {
        statusText: "Summarizing slopOS diagnostics",
        summaryTitle: "Observed slopOS runtime",
        summaryLine: "Inspected bridge/runtime diagnostics before opening a persistent diagnostics surface.",
        surface: {
          kind: "existing",
          moduleId: "diagnostics-inspector",
          title: coreSurfaceDescriptors["diagnostics-inspector"].title,
          retention: "pinned",
          data: {
            sessionKey: "desktop-main",
            initialSnapshot: snapshot
          }
        }
      }
    };
  }

  if (normalized.includes("browser") || normalized.includes("website") || normalized.includes("open docs") || normalized.includes("vite docs")) {
    return {
      kind: "final",
      spec: {
        statusText: "Opening an embedded browser pane",
        summaryTitle: "Opened browser pane",
        summaryLine: "Kept a browser artifact visible inside the slopOS canvas.",
        surface: {
          kind: "browser",
          title: "Vite Docs",
          retention: "pinned",
          url: normalized.includes("spotify") ? "https://open.spotify.com" : "https://vite.dev/guide/"
        }
      }
    };
  }

  if (normalized.includes("terminal") || normalized.includes("shell")) {
    return {
      kind: "final",
      spec: {
        statusText: "Opening a live terminal surface",
        summaryTitle: makeSummaryTitle(task.intent),
        summaryLine: "Opened a live shell artifact that stays around for follow-up commands.",
        surface: {
          kind: "existing",
          moduleId: "terminal-surface",
          title: coreSurfaceDescriptors["terminal-surface"].title,
          retention: "pinned",
          data: {
            cwd: "/home/n/slopos",
            title: "Terminal Workspace"
          }
        }
      }
    };
  }

  if (normalized.includes("inspect") || normalized.includes("what's here") || normalized.includes("what is here") || normalized.includes("list files")) {
    if (!hasToolResults) {
      return {
        kind: "tool_calls",
        statusText: "Inspecting the workspace first",
        calls: [
          {
            name: "shell_exec",
            args: {
              cmd: "pwd && printf '\n---\n' && ls",
              cwd: "/home/n/slopos"
            },
            options: {
              runAs: "user",
              timeoutMs: 5000
            }
          }
        ]
      };
    }

    return {
      kind: "final",
      spec: {
        statusText: "Summarizing the workspace",
        summaryTitle: "Inspected workspace",
        summaryLine: "Ran a shell inspection first and then opened a task-shaped workspace around the result.",
        surface: {
          kind: "runtime",
          title: "Workspace Inspection",
          retention: "pinned",
          runtime: {
            title: "Workspace Inspection",
            subtitle: "A runtime surface built after a shell inspection step.",
            headline: "Inspection intent",
            body: `The bridge inspected the workspace before creating this surface. Latest result: ${JSON.stringify(context?.toolResults?.[0]?.output ?? "")}`,
            primaryUrl: "https://vite.dev/guide/",
            shellCommand: "ls",
            readPath: "/home/n/slopos/README.md"
          }
        }
      }
    };
  }

  if (normalized.includes("understand this repo") || normalized.includes("analyze this repo") || normalized.includes("map this repo")) {
    if (toolResults.length === 0) {
      return {
        kind: "tool_calls",
        statusText: "Inspecting the repo layout first",
        calls: [
          {
            name: "shell_exec",
            args: {
              cmd: "pwd && printf '\n---\n' && ls",
              cwd: "/home/n/slopos"
            },
            options: {
              runAs: "user",
              timeoutMs: 5000
            }
          }
        ]
      };
    }

    if (toolResults.length === 1) {
      return {
        kind: "tool_calls",
        statusText: "Reading the repo README next",
        calls: [
          {
            name: "fs_read",
            args: {
              path: "/home/n/slopos/README.md"
            },
            options: {
              runAs: "user"
            }
          }
        ]
      };
    }

    return {
      kind: "final",
      spec: {
        statusText: "Building a repo analysis surface",
        summaryTitle: "Analyzed repository",
        summaryLine: "Used multiple inspection steps before building a task surface around the repo.",
        surface: {
          kind: "runtime",
          title: "Repository Analysis",
          retention: "pinned",
          runtime: {
            title: "Repository Analysis",
            subtitle: "Built after multiple tool-guided inspection steps.",
            headline: "Analysis intent",
            body: `The bridge completed ${toolResults.length} inspection steps before generating this surface. Latest tool: ${toolResults[toolResults.length - 1]?.name ?? "none"}.`,
            primaryUrl: "https://vite.dev/guide/",
            shellCommand: "ls",
            readPath: "/home/n/slopos/README.md"
          }
        }
      }
    };
  }

  if (normalized.includes("delete temp file") || normalized.includes("clean up temp file")) {
    if (!hasToolResults) {
      return {
        kind: "tool_calls",
        statusText: "Attempting the cleanup command",
        calls: [
          {
            name: "shell_exec",
            args: {
              cmd: "rm -f /home/n/slopos/.slopos-temp-delete-me"
            },
            options: {
              runAs: "user"
            }
          }
        ]
      };
    }

    return {
      kind: "final",
      spec: {
        statusText: "Cleanup command needs confirmation",
        summaryTitle: "Blocked destructive command",
        summaryLine: "The planner attempted a destructive shell command and the bridge refused to run it without confirmation.",
        surface: {
          kind: "runtime",
          title: "Confirmation Required",
          retention: "pinned",
          runtime: {
            title: "Confirmation Required",
            subtitle: "Bridge safety policy stopped this tool call.",
            headline: "Blocked command",
            body: "The bridge blocked a destructive planner-issued shell command. Route this through an explicit confirmation flow or run it from a user-triggered surface instead.",
            primaryUrl: "https://vite.dev/guide/",
            shellCommand: "ls",
            readPath: "/home/n/slopos/README.md"
          }
        }
      }
    };
  }

  if (!hasToolResults && (normalized.includes("code") || normalized.includes("coding"))) {
    return {
      kind: "tool_calls",
      statusText: "Inspecting the workspace before opening coding tools",
      calls: [
        {
          name: "shell_exec",
          args: {
            cmd: "pwd && printf '\n---\n' && ls",
            cwd: "/home/n/slopos"
          },
          options: {
            runAs: "user",
            timeoutMs: 5000
          }
        }
      ]
    };
  }

  return {
    kind: "final",
    spec: {
      statusText: hasToolResults ? "Preparing a coding workspace from fresh tool context" : "Preparing a coding workspace",
      summaryTitle: makeSummaryTitle(task.intent),
      summaryLine: hasToolResults
        ? "Used a tool pass before keeping a task-shaped workspace visible."
        : "Kept a task-shaped workspace visible and collapsed setup into the Chronicle.",
      surface: {
        kind: "existing",
        moduleId: "coding-workspace",
        title: coreSurfaceDescriptors["coding-workspace"].title,
        retention: "pinned",
        data: {
          repo: "/home/n/slopos",
          docsUrl: "https://vite.dev/guide/"
        }
      }
    }
  };
}

export function planIntentFromSpec(task: Task, spec: PlannerSpec) {
  return buildResponseFromSpec(task, spec);
}

export function heuristicPlannerSpec(task: Task, context?: PlannerRuntimeContext): PlannerSpec {
  const step = heuristicNextAgentStep(task, context);
  if (step.kind !== "final") {
    throw new Error("heuristic planner step requested tool calls instead of a final spec");
  }
  return step.spec;
}

export function planIntent(task: Task): AgentTurnResponse {
  return buildResponseFromSpec(task, heuristicPlannerSpec(task));
}
