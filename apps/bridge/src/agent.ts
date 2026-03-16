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

type GeneratedSurfaceSpec = {
  code: string;
  title: string;
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
    kind: "existing" | "runtime" | "generated";
    moduleId?: ExistingModuleId;
    title: string;
    retention: RetentionMode;
    url?: string;
    data?: Record<string, unknown>;
    runtime?: RuntimeSurfaceSpec;
    generated?: GeneratedSurfaceSpec;
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
  }>;
  systemSnapshot?: {
    runningApps?: string[];
    activeWindow?: string;
    clipboard?: string;
    desktopPath?: string;
    workspacePath?: string;
    currentTime?: string;
    uptime?: string;
    batteryPercent?: number;
    memoryUsedPercent?: number;
    cpuUsagePercent?: number;
    networkStatus?: string;
    bluetoothStatus?: string;
    audioVolume?: number;
    audioMuted?: boolean;
    displayCount?: number;
  };
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

  if (moduleId === "settings-panel") {
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

/**
 * Ensure generated surface code has the required imports.
 * LLMs frequently omit one or more import lines.
 */
function ensureImports(code: string): string {
  let header = "";

  if (!code.includes("import React")) {
    header += 'import React from "react";\n';
  }

  if (!code.includes("@slopos/ui")) {
    // Scan which UI components are actually used and import them
    const uiComponents = ["Badge", "Button", "Card", "Column", "Row", "Text", "Meter", "FactGrid", "SectionList", "Screen", "PromptBox"];
    const used = uiComponents.filter((c) => code.includes(c));
    if (used.length > 0) {
      header += `import { ${used.join(", ")} } from "@slopos/ui";\n`;
    }
  }

  if (!code.includes("@slopos/host")) {
    const hostImports: string[] = [];
    if (code.includes("useHost")) hostImports.push("useHost");
    if (code.includes("useEvent")) hostImports.push("useEvent");
    if (code.includes("SurfaceProps")) hostImports.push("type SurfaceProps");
    if (hostImports.length > 0) {
      header += `import { ${hostImports.join(", ")} } from "@slopos/host";\n`;
    }
  }

  return header ? header + "\n" + code : code;
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
  } else if (spec.surface.kind === "generated" && spec.surface.generated?.code) {
    const generatedId = `gen-${task.id.replace("task-", "")}`;
    const generatedPath = `apps/shell/generated/${generatedId}.tsx`;
    const code = ensureImports(spec.surface.generated.code);
    operations.push(
      {
        type: "write_surface_module",
        module: {
          id: generatedId,
          path: generatedPath,
          code
        }
      },
      {
        type: "create_artifact",
        artifact: {
          id: `${task.id}-generated`,
          artifactType: "surface",
          title: spec.surface.generated.title || spec.surface.title,
          renderer: "tsx",
          retention: sanitizeRetention(
            // Generated surfaces are created to be shown — never collapse them
            spec.surface.retention === "collapsed" ? "ephemeral" : spec.surface.retention
          ),
          placement: "center",
          payload: {
            moduleId: generatedId,
            data: {
              intent: task.intent,
              ...(spec.surface.data ?? {})
            }
          }
        }
      }
    );
  } else if (spec.surface.kind === "runtime") {
    operations.push(
      {
        type: "write_surface_module",
        module: {
          id: "runtime-surface",
          path: "apps/shell/generated/runtime-surface.tsx",
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
          retention: sanitizeRetention(
            spec.surface.retention === "collapsed" ? "ephemeral" : spec.surface.retention
          ),
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

export function planIntentFromSpec(task: Task, spec: PlannerSpec) {
  return buildResponseFromSpec(task, spec);
}
