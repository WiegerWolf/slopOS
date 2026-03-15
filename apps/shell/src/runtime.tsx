import React from "react";
import {
  HostContext,
  SurfaceContext,
  type ConfirmationRequest,
  type Host,
  type SurfaceContextValue,
  type ToolCallOptions
} from "@slopos/host";
import type {
  AgentTurnResponse,
  Artifact,
  ChronicleEntry,
  Operation,
  ProtocolAck,
  Task,
  TaskStatus,
  TurnCreateResponse,
  TurnPart
} from "@slopos/runtime";
import { CONTRACT_VERSIONS } from "@slopos/runtime";
import { connectTurnStream } from "./turn-stream";

type EventStore = Record<string, unknown>;

type PlannerContext = {
  statusText?: string;
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
};

type ToolEnvelope = {
  protocolVersion?: number;
  ok: boolean;
  output: unknown;
  error?: string;
  confirmationRequired?: {
    title: string;
    message: string;
  };
  events?: EventStore;
};

export type ProtocolIssue = {
  message: string;
  expectedProtocolVersion?: number;
  receivedProtocolVersion?: number;
};

export type ActionLogEntry = {
  id: string;
  timestamp: number;
  kind: "intent" | "operation" | "tool" | "status" | "task" | "error";
  title: string;
  detail?: string;
};

export type PendingConfirmation = {
  id: string;
  title: string;
  message: string;
  actionLabel: string;
  cancelLabel: string;
  taskId?: string;
  turnId?: string;
  source: "turn" | "host" | "tool";
};

export type ConfirmationRecord = {
  id: string;
  title: string;
  message: string;
  actionLabel: string;
  cancelLabel: string;
  taskId?: string;
  turnId?: string;
  source: "turn" | "host" | "tool";
  createdAt: number;
  updatedAt: number;
  status: "pending" | "approved" | "denied";
};

type RuntimeValue = {
  tasks: Task[];
  chronicle: ChronicleEntry[];
  artifacts: Artifact[];
  focusedArtifact?: Artifact;
  actionLog: ActionLogEntry[];
  confirmationHistory: ConfirmationRecord[];
  pendingConfirmation: PendingConfirmation | null;
  protocolIssue: ProtocolIssue | null;
  statusText: string;
  agentTurn?: AgentTurnResponse;
  submitIntent: (intent: string) => Promise<void>;
  respondToConfirmation: (approved: boolean) => void;
  clearProtocolIssue: () => void;
  getSurfaceContext: (artifactId: string) => SurfaceContextValue;
  host: Host;
  updateArtifactById: (artifactId: string, patch: Parameters<Host["updateArtifact"]>[0]) => void;
  setRetentionById: (artifactId: string, mode: Parameters<Host["setRetention"]>[0]) => void;
  completeTaskForTask: (taskId: string, summary: Parameters<Host["completeTask"]>[0]) => void;
  failTaskForTask: (taskId: string, error: Parameters<Host["failTask"]>[0]) => void;
};

const RuntimeContext = React.createContext<RuntimeValue | null>(null);

const LEGACY_SHELL_STORAGE_KEYS = ["slopos.shell.state", "slopos.shell.state.v1"];
const SHELL_STORAGE_KEY = `slopos.shell.state.v${CONTRACT_VERSIONS.shellState}`;

type PersistedShellState = {
  version: number;
  tasks: Task[];
  chronicle: ChronicleEntry[];
  artifacts: Artifact[];
  actionLog: ActionLogEntry[];
  confirmationHistory: ConfirmationRecord[];
  statusText: string;
};

function migrateShellState(input: Partial<PersistedShellState>): PersistedShellState | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const version = typeof input.version === "number" ? input.version : 0;
  if (version > CONTRACT_VERSIONS.shellState) {
    return null;
  }

  return {
    version: CONTRACT_VERSIONS.shellState,
    tasks: Array.isArray(input.tasks) ? input.tasks.map((task) => restoreTask(task as Task)) : createInitialTasks(),
    chronicle: Array.isArray(input.chronicle) ? input.chronicle as ChronicleEntry[] : createInitialChronicle(),
    artifacts: Array.isArray(input.artifacts) ? (input.artifacts as Artifact[]).map((artifact) => restoreArtifact(artifact)) : [],
    actionLog: Array.isArray(input.actionLog) ? input.actionLog as ActionLogEntry[] : [],
    confirmationHistory: Array.isArray(input.confirmationHistory) ? input.confirmationHistory as ConfirmationRecord[] : [],
    statusText: typeof input.statusText === "string" ? input.statusText : "Hit ` and say what you want."
  };
}

type ArtifactRestoreMetadata = {
  strategy: "surface" | "terminal_surface" | "browser_artifact";
  moduleId?: string;
};

const SHELL_SESSION_KEY = "desktop-main";

function createInitialTasks(): Task[] {
  return [
    {
      id: "task-boot",
      intent: "boot into command shell",
      createdAt: Date.now() - 300000,
      updatedAt: Date.now() - 240000,
      status: "completed",
      source: {
        mode: "text",
        rawInput: "boot into command shell",
        wakeMethod: "other"
      },
      plan: null,
      artifacts: [],
      chronicleEntryId: "chronicle-boot",
      parentTaskId: null,
      priority: "foreground",
      confirmationRequests: [],
      logs: [],
      summary: {
        title: "Booted shell",
        oneLine: "Started on a calm canvas with one prompt in the center."
      }
    }
  ];
}

function createInitialChronicle(): ChronicleEntry[] {
  return [
    {
      id: "chronicle-boot",
      taskId: "task-boot",
      createdAt: Date.now() - 240000,
      updatedAt: Date.now() - 240000,
      title: "Booted shell",
      oneLine: "Started on a calm canvas with one prompt in the center.",
      status: "completed",
      visibleArtifacts: [],
      collapsedArtifacts: [],
      discardedArtifacts: [],
      resumable: false,
      restoreMode: "snapshot",
      tags: ["boot"],
      uiState: {
        expanded: false,
        height: "line"
      }
    }
  ];
}

function restoreTask(task: Task): Task {
  if (
    task.status === "planning" ||
    task.status === "running" ||
    task.status === "waiting_confirmation" ||
    task.status === "blocked"
  ) {
    return {
      ...task,
      status: "backgrounded",
      updatedAt: Date.now(),
      logs: [...task.logs, { timestamp: Date.now(), message: "Recovered after shell reload" }]
    };
  }

  return task;
}

function withRestoreMetadata(artifact: Artifact): Artifact {
  const moduleId = typeof artifact.payload.moduleId === "string" ? artifact.payload.moduleId : undefined;

  if (artifact.type === "browser") {
    return {
      ...artifact,
      payload: {
        ...artifact.payload,
        restoreMeta: {
          strategy: "browser_artifact"
        } satisfies ArtifactRestoreMetadata
      }
    };
  }

  if (!moduleId || artifact.type !== "surface") {
    return artifact;
  }

  const restoreMeta: ArtifactRestoreMetadata = {
    strategy: moduleId === "terminal-surface" ? "terminal_surface" : "surface",
    moduleId
  };

  return {
    ...artifact,
    payload: {
      ...artifact.payload,
      restoreMeta
    }
  };
}

function restoreArtifact(artifact: Artifact): Artifact {
  const restoreMeta = artifact.payload.restoreMeta as ArtifactRestoreMetadata | undefined;
  if (!restoreMeta) {
    return artifact;
  }

  if (artifact.type === "browser") {
    return {
      ...artifact,
      updatedAt: Date.now(),
      payload: {
        ...artifact.payload,
        restoredFromPersistence: true,
        restoreStrategy: restoreMeta.strategy
      }
    };
  }

  if (artifact.type !== "surface") {
    return artifact;
  }

  return {
    ...artifact,
    updatedAt: Date.now(),
    payload: {
      ...artifact.payload,
      data: {
        ...((artifact.payload.data as Record<string, unknown> | undefined) ?? {}),
        restoredFromPersistence: true,
        restoreStrategy: restoreMeta.strategy
      }
    }
  };
}

function loadPersistedShellState(): PersistedShellState | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SHELL_STORAGE_KEY)
      ?? LEGACY_SHELL_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean)
      ?? null;
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedShellState>;
    return migrateShellState(parsed);
  } catch {
    return null;
  }
}

function persistShellState(state: PersistedShellState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify(state));
}

function extractBrowserSessions(artifacts: Artifact[]) {
  return artifacts
    .filter((artifact) => artifact.type === "browser")
    .map((artifact) => {
      const data = (artifact.payload.data as Record<string, unknown> | undefined) ?? {};
      const tabs = Array.isArray(data.tabs)
        ? data.tabs.flatMap((entry) => {
            if (!entry || typeof entry !== "object") {
              return [];
            }

            const url = typeof (entry as { url?: unknown }).url === "string" ? (entry as { url: string }).url : undefined;
            if (!url) {
              return [];
            }

            return [{
              id: typeof (entry as { id?: unknown }).id === "string" ? (entry as { id: string }).id : crypto.randomUUID(),
              title: typeof (entry as { title?: unknown }).title === "string" ? (entry as { title: string }).title : url,
              url,
              previewText: typeof (entry as { previewText?: unknown }).previewText === "string"
                ? (entry as { previewText: string }).previewText
                : undefined,
              captureState: (entry as { captureState?: unknown }).captureState === "available" || (entry as { captureState?: unknown }).captureState === "unavailable"
                ? (entry as { captureState: "available" | "unavailable" }).captureState
                : undefined
            }];
          })
        : [];

      const activeTab = data.activeTab && typeof data.activeTab === "object"
        ? data.activeTab as Record<string, unknown>
        : undefined;

      return {
        artifactId: artifact.id,
        title: artifact.title,
        activeUrl:
          typeof data.url === "string"
            ? data.url
            : typeof artifact.payload.url === "string"
              ? artifact.payload.url
              : "",
        tabCount: typeof data.tabCount === "number" ? data.tabCount : tabs.length,
        sessionSummary: typeof data.sessionSummary === "string" ? data.sessionSummary : undefined,
        activeTab: activeTab
          ? {
              id: typeof activeTab.id === "string" ? activeTab.id : undefined,
              title: typeof activeTab.title === "string" ? activeTab.title : undefined,
              url: typeof activeTab.url === "string" ? activeTab.url : undefined,
              previewText: typeof activeTab.previewText === "string" ? activeTab.previewText : undefined,
              captureState: activeTab.captureState === "available" || activeTab.captureState === "unavailable"
                ? activeTab.captureState
                : undefined
            }
          : undefined,
        tabs,
        updatedAt: artifact.updatedAt
      };
    });
}

function extractSloposSessionSnapshot(input: {
  statusText: string;
  artifacts: Artifact[];
  chronicle: ChronicleEntry[];
  confirmationHistory: ConfirmationRecord[];
}) {
  return {
    sessionKey: SHELL_SESSION_KEY,
    statusText: input.statusText,
    artifacts: input.artifacts
      .filter((artifact) => artifact.visible)
      .slice(0, 12)
      .map((artifact) => {
        const data = (artifact.payload.data as Record<string, unknown> | undefined) ?? {};
        return {
          id: artifact.id,
          title: artifact.title,
          type: artifact.type,
          retention: artifact.retention,
          moduleId: typeof artifact.payload.moduleId === "string" ? artifact.payload.moduleId : undefined,
          sessionSummary: typeof data.sessionSummary === "string" ? data.sessionSummary : undefined,
          currentUrl:
            typeof data.url === "string"
              ? data.url
              : typeof artifact.payload.url === "string"
                ? artifact.payload.url
                : undefined
        };
      }),
    chronicle: input.chronicle.slice(0, 10).map((entry) => ({
      id: entry.id,
      title: entry.title,
      oneLine: entry.oneLine,
      status: entry.status
    })),
    confirmations: input.confirmationHistory.slice(0, 10).map((entry) => ({
      id: entry.id,
      title: entry.title,
      status: entry.status,
      source: entry.source
    })),
    updatedAt: Date.now()
  };
}

function makeTaskStatusUpdate(task: Task, status: TaskStatus, statusText: string): Task {
  return {
    ...task,
    status,
    updatedAt: Date.now(),
    logs: [...task.logs, { timestamp: Date.now(), message: statusText }]
  };
}

function createChronicleEntry(task: Task, artifacts: Artifact[]): ChronicleEntry {
  return {
    id: `chronicle-${task.id}`,
    taskId: task.id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    title: task.summary.title,
    oneLine: task.summary.oneLine,
    status: task.status === "failed" ? "failed" : task.status === "backgrounded" ? "background" : "completed",
    visibleArtifacts: artifacts.filter((artifact) => artifact.retention === "pinned" || artifact.retention === "persistent").map((artifact) => artifact.id),
    collapsedArtifacts: artifacts.filter((artifact) => artifact.retention === "collapsed").map((artifact) => artifact.id),
    discardedArtifacts: artifacts.filter((artifact) => artifact.retention === "ephemeral").map((artifact) => artifact.id),
    resumable: true,
    restoreMode: "snapshot",
    tags: ["runtime"],
    uiState: {
      expanded: false,
      height: "line"
    }
  };
}

function makeArtifact(taskId: string, operation: Extract<Operation, { type: "create_artifact" }>["artifact"]): Artifact {
  const focused = operation.retention !== "background";
  const visible = operation.retention !== "collapsed";

  return withRestoreMetadata({
    id: operation.id,
    taskId,
    type: operation.artifactType,
    title: operation.title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    state: operation.retention === "collapsed" ? "collapsed" : operation.retention === "background" ? "background" : "active",
    retention: operation.retention,
    visible,
    focused,
    userPinned: operation.retention === "pinned",
    userDismissed: false,
    recreateCost: operation.retention === "pinned" ? "high" : "medium",
    usefulness: operation.retention === "pinned" ? 0.9 : 0.5,
    continuityScore: operation.retention === "pinned" ? 0.85 : 0.45,
    isFinalOutput: operation.retention === "pinned" || operation.retention === "persistent",
    isScaffolding: operation.retention === "ephemeral",
    isRunning: false,
    payload: operation.payload
  });
}

function summarizeOperation(operation: Operation) {
  switch (operation.type) {
    case "set_task_status":
      return {
        title: `Status -> ${operation.status}`,
        detail: operation.statusText
      };
    case "tool_call":
      return {
        title: `Tool ${operation.tool}`,
        detail: JSON.stringify(operation.args)
      };
    case "write_surface_module":
      return {
        title: `Write surface ${operation.module.id}`,
        detail: operation.module.path
      };
    case "create_artifact":
      return {
        title: `Create ${operation.artifact.title}`,
        detail: `${operation.artifact.renderer} / ${operation.artifact.retention}`
      };
    case "update_artifact":
      return {
        title: `Update artifact ${operation.artifactId}`,
        detail: JSON.stringify(operation.patch)
      };
    case "destroy_artifact":
      return {
        title: `Destroy artifact ${operation.artifactId}`
      };
    case "set_retention":
      return {
        title: `Retention -> ${operation.retention}`,
        detail: operation.reason
      };
    case "request_confirmation":
      return {
        title: `Confirm ${operation.confirmation.title}`,
        detail: operation.confirmation.message
      };
    case "subscribe_event":
      return {
        title: `Subscribe ${operation.subscription.source}`
      };
    case "complete_task":
      return {
        title: `Complete ${operation.summary.title}`,
        detail: operation.summary.oneLine
      };
    case "fail_task":
      return {
        title: `Fail task`,
        detail: operation.error.oneLine
      };
  }
}

function summarizeOutput(output: unknown) {
  if (typeof output === "string") {
    return output;
  }

  if (output && typeof output === "object") {
    const json = JSON.stringify(output);
    return json.length > 160 ? `${json.slice(0, 157)}...` : json;
  }

  return output == null ? undefined : String(output);
}

function buildPlannerContext(input: {
  statusText: string;
  tasks: Task[];
  chronicle: ChronicleEntry[];
  artifacts: Artifact[];
  events: EventStore;
}): PlannerContext {
  return {
    statusText: input.statusText,
    visibleArtifacts: input.artifacts
      .filter((artifact) => artifact.visible && artifact.state !== "collapsed")
      .slice(0, 6)
      .map((artifact) => ({
        id: artifact.id,
        title: artifact.title,
        type: artifact.type,
        retention: artifact.retention,
        moduleId: typeof artifact.payload.moduleId === "string" ? artifact.payload.moduleId : undefined,
        currentUrl:
          typeof (artifact.payload.data as Record<string, unknown> | undefined)?.url === "string"
            ? (artifact.payload.data as Record<string, unknown>).url as string
            : typeof artifact.payload.url === "string"
              ? artifact.payload.url as string
              : undefined,
        tabCount:
          typeof (artifact.payload.data as Record<string, unknown> | undefined)?.tabCount === "number"
            ? (artifact.payload.data as Record<string, unknown>).tabCount as number
            : undefined,
        sessionSummary:
          typeof (artifact.payload.data as Record<string, unknown> | undefined)?.sessionSummary === "string"
            ? (artifact.payload.data as Record<string, unknown>).sessionSummary as string
            : undefined
      })),
    activeTasks: input.tasks
      .filter((task) => task.status !== "completed" && task.status !== "failed" && task.status !== "cancelled")
      .slice(0, 6)
      .map((task) => ({
        id: task.id,
        intent: task.intent,
        status: task.status,
        summary: task.summary.oneLine
      })),
    chronicle: input.chronicle.slice(0, 8).map((entry) => ({
      id: entry.id,
      title: entry.title,
      oneLine: entry.oneLine,
      status: entry.status
    })),
    systemEvents: input.events
  };
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let payload: ProtocolAck | undefined;
    try {
      payload = await response.json() as ProtocolAck;
    } catch {
      payload = undefined;
    }

    const error = new Error(payload?.error ?? `request failed: ${response.status}`) as Error & {
      protocolIssue?: ProtocolIssue;
    };

    if (payload?.error === "protocol mismatch") {
      error.protocolIssue = {
        message: "slopOS shell and bridge protocol versions do not match.",
        expectedProtocolVersion: payload.expectedProtocolVersion,
        receivedProtocolVersion: payload.receivedProtocolVersion
      };
    }

    throw error;
  }

  const payload = (await response.json()) as T & Partial<ProtocolAck>;
  if (typeof payload.protocolVersion === "number" && payload.protocolVersion > CONTRACT_VERSIONS.bridgeProtocol) {
    const error = new Error("protocol mismatch") as Error & { protocolIssue?: ProtocolIssue };
    error.protocolIssue = {
      message: "slopOS shell and bridge protocol versions do not match.",
      expectedProtocolVersion: CONTRACT_VERSIONS.bridgeProtocol,
      receivedProtocolVersion: payload.protocolVersion
    };
    throw error;
  }

  return payload as T;
}

export function RuntimeProvider(props: { children: React.ReactNode }) {
  const initialSnapshot = React.useMemo(() => loadPersistedShellState(), []);
  const [tasks, setTasks] = React.useState<Task[]>(() => initialSnapshot?.tasks ?? createInitialTasks());
  const [chronicle, setChronicle] = React.useState<ChronicleEntry[]>(() => initialSnapshot?.chronicle ?? createInitialChronicle());
  const [artifacts, setArtifacts] = React.useState<Artifact[]>(() => initialSnapshot?.artifacts ?? []);
  const [events, setEvents] = React.useState<EventStore>({});
  const [actionLog, setActionLog] = React.useState<ActionLogEntry[]>(() => initialSnapshot?.actionLog ?? []);
  const [confirmationHistory, setConfirmationHistory] = React.useState<ConfirmationRecord[]>(() => initialSnapshot?.confirmationHistory ?? []);
  const [pendingConfirmation, setPendingConfirmation] = React.useState<PendingConfirmation | null>(null);
  const [protocolIssue, setProtocolIssue] = React.useState<ProtocolIssue | null>(null);
  const [statusText, setStatusText] = React.useState(() => initialSnapshot?.statusText ?? "Hit ` and say what you want.");
  const [agentTurn, setAgentTurn] = React.useState<AgentTurnResponse>();
  const confirmationResolverRef = React.useRef<((approved: boolean) => void) | null>(null);

  const tasksRef = React.useRef(tasks);
  const artifactsRef = React.useRef(artifacts);
  const eventsRef = React.useRef(events);

  React.useEffect(() => {
    tasksRef.current = tasks;
    artifactsRef.current = artifacts;
    eventsRef.current = events;
  }, [artifacts, events, tasks]);

  React.useEffect(() => {
    persistShellState({
      version: CONTRACT_VERSIONS.shellState,
      tasks,
      chronicle,
      artifacts,
      actionLog,
      confirmationHistory,
      statusText
    });
  }, [actionLog, artifacts, chronicle, confirmationHistory, statusText, tasks]);

  React.useEffect(() => {
    const browserSessions = extractBrowserSessions(artifacts);
    void fetchJson<ProtocolAck>("/api/browser/sync", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: CONTRACT_VERSIONS.bridgeProtocol,
        sessionKey: SHELL_SESSION_KEY,
        sessions: browserSessions
      })
    }).catch((error) => {
      const issue = (error as { protocolIssue?: ProtocolIssue } | undefined)?.protocolIssue;
      if (issue) {
        setProtocolIssue(issue);
        setStatusText(issue.message);
      }
    });
  }, [artifacts]);

  React.useEffect(() => {
    const snapshot = extractSloposSessionSnapshot({
      statusText,
      artifacts,
      chronicle,
      confirmationHistory
    });

    void fetchJson<ProtocolAck>("/api/session/sync", {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: CONTRACT_VERSIONS.bridgeProtocol,
        ...snapshot
      })
    }).catch((error) => {
      const issue = (error as { protocolIssue?: ProtocolIssue } | undefined)?.protocolIssue;
      if (issue) {
        setProtocolIssue(issue);
        setStatusText(issue.message);
      }
    });
  }, [artifacts, chronicle, confirmationHistory, statusText]);

  const pushLog = React.useCallback((entry: Omit<ActionLogEntry, "id" | "timestamp">) => {
    setActionLog((current) => [
      {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        ...entry
      },
      ...current
    ].slice(0, 40));
  }, []);

  const pushConfirmationRecord = React.useCallback((input: PendingConfirmation) => {
    setConfirmationHistory((current) => [
      {
        ...input,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "pending" as const
      },
      ...current
    ].slice(0, 20));
  }, []);

  const settleConfirmationRecord = React.useCallback((id: string, approved: boolean) => {
    setConfirmationHistory((current) =>
      current.map((record) =>
        record.id === id
          ? {
              ...record,
              status: approved ? "approved" : "denied",
              updatedAt: Date.now()
            }
          : record
      )
    );
  }, []);

  const requestCanvasConfirmation = React.useCallback((input: PendingConfirmation) => {
    return new Promise<boolean>((resolve) => {
      pushConfirmationRecord(input);
      confirmationResolverRef.current = resolve;
      setPendingConfirmation(input);
    });
  }, [pushConfirmationRecord]);

  const respondToConfirmation = React.useCallback((approved: boolean) => {
    const resolver = confirmationResolverRef.current;
    const current = pendingConfirmation;
    confirmationResolverRef.current = null;
    setPendingConfirmation(null);
    if (current) {
      settleConfirmationRecord(current.id, approved);
      pushLog({
        kind: "status",
        title: approved ? `Approved ${current.title}` : `Denied ${current.title}`,
        detail: current.message
      });
    }
    resolver?.(approved);
  }, [pendingConfirmation, pushLog, settleConfirmationRecord]);

  const handleRuntimeError = React.useCallback((error: unknown) => {
    const issue = (error as { protocolIssue?: ProtocolIssue } | undefined)?.protocolIssue;
    if (issue) {
      setProtocolIssue(issue);
      setStatusText(issue.message);
      pushLog({
        kind: "error",
        title: "Protocol mismatch",
        detail: `expected ${issue.expectedProtocolVersion ?? "?"}, received ${issue.receivedProtocolVersion ?? "?"}`
      });
      return;
    }

    const message = error instanceof Error ? error.message : "request failed";
    setStatusText(message);
  }, [pushLog]);

  const clearProtocolIssue = React.useCallback(() => {
    setProtocolIssue(null);
  }, []);

  const refreshEvents = React.useCallback(async () => {
    const next = await fetchJson<{ protocolVersion: number; events: EventStore }>(`/api/events?protocolVersion=${CONTRACT_VERSIONS.bridgeProtocol}`);
    setEvents(next.events);
  }, []);

  React.useEffect(() => {
    void refreshEvents().catch(handleRuntimeError);
    const timer = window.setInterval(() => {
      void refreshEvents().catch(handleRuntimeError);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [handleRuntimeError, refreshEvents]);

  const finalizeTask = React.useCallback((taskId: string, summary: Task["summary"], status: TaskStatus = "completed") => {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status,
              summary,
              updatedAt: Date.now(),
              logs: [...task.logs, { timestamp: Date.now(), message: summary.oneLine }]
            }
          : task
      )
    );

    const nextTask = tasksRef.current.find((task) => task.id === taskId);
    if (!nextTask) {
      return;
    }

    const completedTask: Task = {
      ...nextTask,
      status,
      summary,
      updatedAt: Date.now(),
      logs: [...nextTask.logs, { timestamp: Date.now(), message: summary.oneLine }]
    };

    const taskArtifacts = artifactsRef.current.filter((artifact) => artifact.taskId === taskId);
    const entry = createChronicleEntry(completedTask, taskArtifacts);

    setChronicle((current) => [entry, ...current.filter((item) => item.taskId !== taskId)]);
    setStatusText(summary.oneLine);
    pushLog({
      kind: "task",
      title: `${status === "completed" ? "Completed" : "Updated"} ${summary.title}`,
      detail: summary.oneLine
    });
  }, [pushLog, requestCanvasConfirmation]);

  const failTask = React.useCallback((taskId: string, message: string, oneLine: string) => {
    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              status: "failed",
              updatedAt: Date.now(),
              logs: [...task.logs, { timestamp: Date.now(), message }],
              summary: {
                title: task.summary.title,
                oneLine
              }
            }
          : task
      )
    );
    setStatusText(oneLine);
    pushLog({
      kind: "error",
      title: `Task failed ${taskId}`,
      detail: oneLine
    });
  }, [pushLog]);

  const updateArtifactById = React.useCallback((artifactId: string, patch: Parameters<Host["updateArtifact"]>[0]) => {
    setArtifacts((current) =>
      current.map((artifact) =>
        artifact.id === artifactId
          ? withRestoreMetadata({
              ...artifact,
              title: patch.title ?? artifact.title,
              retention: patch.retention ?? artifact.retention,
              visible: patch.visible ?? artifact.visible,
              payload: patch.data
                ? {
                    ...artifact.payload,
                    data: {
                      ...((artifact.payload.data as Record<string, unknown> | undefined) ?? {}),
                      ...patch.data
                    }
                  }
                : artifact.payload,
              updatedAt: Date.now()
            })
          : artifact
      )
    );
  }, []);

  const setRetentionById = React.useCallback((artifactId: string, mode: Parameters<Host["setRetention"]>[0]) => {
    setArtifacts((current) =>
      current.map((artifact) =>
        artifact.id === artifactId
          ? {
              ...artifact,
              retention: mode,
              visible: mode !== "collapsed",
              state: mode === "collapsed" ? "collapsed" : mode === "background" ? "background" : "active",
              updatedAt: Date.now()
            }
          : artifact
      )
    );
  }, []);

  const completeTaskForTask = React.useCallback((taskId: string, summary: Parameters<Host["completeTask"]>[0]) => {
    finalizeTask(taskId, summary, "completed");
  }, [finalizeTask]);

  const failTaskForTask = React.useCallback((taskId: string, error: Parameters<Host["failTask"]>[0]) => {
    failTask(taskId, error.message, error.oneLine);
  }, [failTask]);

  const callTool = React.useCallback(async <TResult,>(name: string, args?: Record<string, unknown>, options?: ToolCallOptions): Promise<TResult> => {
    if (!options?.quiet) {
      pushLog({
        kind: "tool",
        title: `Run ${name}`,
        detail: summarizeOutput(args)
      });
    }

    let result: ToolEnvelope;
    try {
      result = await fetchJson<ToolEnvelope>("/api/tools", {
        method: "POST",
        body: JSON.stringify({
          protocolVersion: CONTRACT_VERSIONS.bridgeProtocol,
          name,
          args,
          options
        })
      });
    } catch (error) {
      handleRuntimeError(error);
      throw error;
    }

    if (result.events) {
      setEvents(result.events);
    }

    if (result.confirmationRequired && options?.confirm !== true) {
      const accepted = await requestCanvasConfirmation({
        id: crypto.randomUUID(),
        title: result.confirmationRequired.title,
        message: result.confirmationRequired.message,
        actionLabel: "Approve",
        cancelLabel: "Cancel",
        source: "tool"
      });
      if (!accepted) {
        const message = `${name} cancelled`;
        setStatusText(message);
        if (!options?.quiet) {
          pushLog({
            kind: "status",
            title: `${name} cancelled`,
            detail: result.confirmationRequired.message
          });
        }
        throw new Error(message);
      }

      return callTool<TResult>(name, args, {
        ...options,
        confirm: true
      });
    }

    if (!result.ok) {
      const message = result.error ?? `${name} failed`;
      setStatusText(message);
      if (!options?.quiet) {
        pushLog({
          kind: "error",
          title: `${name} failed`,
          detail: message
        });
      }
      throw new Error(message);
    }

    if (!options?.quiet) {
      setStatusText(`${name} finished`);
      pushLog({
        kind: "tool",
        title: `${name} finished`,
        detail: summarizeOutput(result.output)
      });
    }
    return result.output as TResult;
  }, [handleRuntimeError, pushLog]);

  const applyOperation = React.useCallback(async (taskId: string, operation: Operation) => {
    const summary = summarizeOperation(operation);
    pushLog({
      kind: "operation",
      title: summary.title,
      detail: summary.detail
    });

    if (operation.type === "set_task_status") {
      setTasks((current) => current.map((task) => (task.id === taskId ? makeTaskStatusUpdate(task, operation.status, operation.statusText) : task)));
      setStatusText(operation.statusText);
      pushLog({
        kind: "status",
        title: `Task ${taskId}`,
        detail: operation.statusText
      });
      return;
    }

    if (operation.type === "tool_call") {
      await callTool(operation.tool, operation.args, {
        runAs: operation.runAs,
        timeoutMs: operation.timeoutMs
      });
      return;
    }

    if (operation.type === "write_surface_module") {
      setStatusText(`Writing ${operation.module.id}`);
      try {
        await fetchJson<ProtocolAck>("/api/surfaces/write", {
          method: "POST",
          body: JSON.stringify({
            protocolVersion: CONTRACT_VERSIONS.bridgeProtocol,
            moduleId: operation.module.id,
            path: operation.module.path,
            code: operation.module.code
          })
        });
      } catch (error) {
        handleRuntimeError(error);
        throw error;
      }
      return;
    }

    if (operation.type === "create_artifact") {
      const nextArtifact = makeArtifact(taskId, operation.artifact);
      setArtifacts((current) => [nextArtifact, ...current.map((artifact) => ({ ...artifact, focused: false }))]);
      setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, artifacts: [...task.artifacts, nextArtifact.id] } : task)));
      return;
    }

    if (operation.type === "update_artifact") {
      setArtifacts((current) =>
        current.map((artifact) =>
          artifact.id === operation.artifactId
            ? {
                ...artifact,
                payload: { ...artifact.payload, ...operation.patch },
                updatedAt: Date.now()
              }
            : artifact
        )
      );
      return;
    }

    if (operation.type === "destroy_artifact") {
      setArtifacts((current) => current.filter((artifact) => artifact.id !== operation.artifactId));
      return;
    }

    if (operation.type === "set_retention") {
      setArtifacts((current) =>
        current.map((artifact) =>
          artifact.id === operation.artifactId
            ? {
                ...artifact,
                retention: operation.retention,
                visible: operation.retention !== "collapsed",
                state: operation.retention === "collapsed" ? "collapsed" : operation.retention === "background" ? "background" : "active",
                updatedAt: Date.now()
              }
            : artifact
        )
      );
      return;
    }

    if (operation.type === "request_confirmation") {
      const accepted = await requestCanvasConfirmation({
        id: operation.confirmation.id,
        title: operation.confirmation.title,
        message: operation.confirmation.message,
        actionLabel: operation.confirmation.actionLabel,
        cancelLabel: operation.confirmation.cancelLabel,
        source: "host",
        taskId
      });
      setStatusText(accepted ? operation.confirmation.actionLabel : operation.confirmation.cancelLabel);
      return;
    }

    if (operation.type === "subscribe_event") {
      await refreshEvents();
      return;
    }

    if (operation.type === "complete_task") {
      finalizeTask(taskId, operation.summary, "completed");
      return;
    }

    if (operation.type === "fail_task") {
      failTask(taskId, operation.error.message, operation.error.oneLine);
    }
  }, [callTool, failTask, finalizeTask, pushLog, refreshEvents]);

  const handleTurnPart = React.useCallback(async (part: TurnPart) => {
    if (part.kind === "turn_start") {
      setTasks((current) => [part.task, ...current.filter((task) => task.id !== part.task.id)]);
      return;
    }

    if (part.kind === "planner") {
      pushLog({
        kind: "status",
        title: `Planner responded for ${part.taskId}`,
        detail: `${part.statusText} (${part.plannerSource})`
      });
      setStatusText(part.statusText);
      return;
    }

    if (part.kind === "tool_call") {
      pushLog({
        kind: "tool",
        title: `Planner tool ${part.tool.name}`,
        detail: summarizeOutput(part.tool.args)
      });
      setStatusText(`Running ${part.tool.name}`);
      return;
    }

    if (part.kind === "tool_result") {
      pushLog({
        kind: part.ok ? "tool" : "error",
        title: part.ok ? `${part.tool.name} completed` : `${part.tool.name} failed`,
        detail: part.ok ? summarizeOutput(part.output) : part.error
      });
      if (!part.ok && part.error) {
        setStatusText(part.error);
      }
      return;
    }

    if (part.kind === "confirmation_request") {
      pushLog({
        kind: "status",
        title: `Confirmation required for ${part.confirmation.tool.name}`,
        detail: part.confirmation.message
      });
      setStatusText(part.confirmation.title);

      const approved = await requestCanvasConfirmation({
        id: part.confirmation.id,
        title: part.confirmation.title,
        message: part.confirmation.message,
        actionLabel: "Approve",
        cancelLabel: "Decline",
        source: "turn",
        taskId: part.taskId,
        turnId: part.turnId
      });
      try {
        await fetchJson<ProtocolAck>(`/api/turns/${part.turnId}/confirm`, {
          method: "POST",
          body: JSON.stringify({
            protocolVersion: CONTRACT_VERSIONS.bridgeProtocol,
            confirmationId: part.confirmation.id,
            approved
          })
        });
      } catch (error) {
        handleRuntimeError(error);
        throw error;
      }
      return;
    }

    if (part.kind === "confirmation_result") {
      settleConfirmationRecord(part.confirmation.id, part.confirmation.approved);
      pushLog({
        kind: "status",
        title: `Confirmation ${part.confirmation.approved ? "approved" : "denied"}`,
        detail: part.confirmation.id
      });
      setStatusText(part.confirmation.approved ? "Confirmation approved" : "Confirmation denied");
      return;
    }

    if (part.kind === "operation") {
      if (part.operation.type === "set_task_status") {
        const operation = part.operation;
        setAgentTurn((current) => ({
          taskId: part.taskId,
          intent: current?.intent ?? tasksRef.current.find((task) => task.id === part.taskId)?.intent ?? "",
          mode: current?.mode ?? "foreground",
          statusText: operation.statusText,
          operations: current ? [...current.operations, operation] : [operation]
        }));
      }
      await applyOperation(part.taskId, part.operation);
      return;
    }

    if (part.kind === "turn_error") {
      failTask(part.taskId, part.message, part.message);
      return;
    }

    if (part.kind === "turn_complete") {
      pushLog({
        kind: "task",
        title: `Turn completed ${part.taskId}`,
        detail: "Agent turn settled"
      });
    }
  }, [applyOperation, failTask, handleRuntimeError, pushLog, requestCanvasConfirmation, settleConfirmationRecord]);

  const submitIntent = React.useCallback(async (intent: string) => {
    pushLog({
      kind: "intent",
      title: "Invoke intent",
      detail: intent
    });

    const plannerContext = buildPlannerContext({
      statusText,
      tasks: tasksRef.current,
      chronicle: chronicle,
      artifacts: artifactsRef.current,
      events: eventsRef.current
    });

    let envelope: TurnCreateResponse;
    try {
      envelope = await fetchJson<TurnCreateResponse>("/api/turns", {
        method: "POST",
        body: JSON.stringify({
          protocolVersion: CONTRACT_VERSIONS.bridgeProtocol,
          intent,
          context: plannerContext,
          sessionKey: SHELL_SESSION_KEY
        })
      });
    } catch (error) {
      handleRuntimeError(error);
      throw error;
    }

    pushLog({
      kind: "status",
      title: `Turn created ${envelope.turnId.slice(0, 8)}`,
      detail: `Waiting for streamed planner parts for ${envelope.taskId}`
    });

    await new Promise<void>((resolve, reject) => {
      const close = connectTurnStream(envelope.turnId, {
        protocolVersion: CONTRACT_VERSIONS.bridgeProtocol,
        onPart(part) {
          void handleTurnPart(part).then(() => {
            if (part.kind === "turn_complete" || part.kind === "turn_error") {
              close();
              resolve();
            }
          }).catch((error) => {
            close();
            reject(error);
          });
        },
        onError(issue) {
          if (issue) {
            setProtocolIssue(issue);
            setStatusText(issue.message);
          }
          close();
          reject(new Error("turn stream failed"));
        }
      });
    });
  }, [chronicle, handleRuntimeError, handleTurnPart, pushLog, statusText]);

  const host = React.useMemo<Host>(() => ({
    async tool<TResult = unknown>(name: string, args?: Record<string, unknown>, options?: ToolCallOptions) {
      return callTool<TResult>(name, args, options);
    },
    subscribe<T = unknown>(source: string) {
      return {
        get: () => eventsRef.current[source] as T | undefined,
        unsubscribe: () => undefined
      };
    },
    updateArtifact(patch) {
      const target = artifactsRef.current.find((artifact) => artifact.focused) ?? artifactsRef.current[0];
      if (target) {
        updateArtifactById(target.id, patch);
      }
    },
    setRetention(mode) {
      const target = artifactsRef.current.find((artifact) => artifact.focused) ?? artifactsRef.current[0];
      if (target) {
        setRetentionById(target.id, mode);
      }
    },
    setPlacement() {
      return;
    },
    requestConfirmation(input: ConfirmationRequest) {
      return requestCanvasConfirmation({
        id: crypto.randomUUID(),
        title: input.title,
        message: input.message,
        actionLabel: input.actionLabel,
        cancelLabel: input.cancelLabel,
        source: "host"
      });
    },
    completeTask(summary) {
      const target = tasksRef.current.find((task) => task.status === "running" || task.status === "planning");
      if (target) {
        finalizeTask(target.id, summary, "completed");
      }
    },
    failTask(error) {
      const target = tasksRef.current.find((task) => task.status === "running" || task.status === "planning");
      if (target) {
        failTask(target.id, error.message, error.oneLine);
      }
    },
    logStatus(nextStatus) {
      setStatusText(nextStatus);
      pushLog({
        kind: "status",
        title: "Surface status",
        detail: nextStatus
      });
    }
  }), [callTool, failTask, finalizeTask, pushLog, requestCanvasConfirmation]);

  const getSurfaceContext = React.useCallback((artifactId: string): SurfaceContextValue => {
    const artifact = artifactsRef.current.find((item) => item.id === artifactId);
    return {
      taskId: artifact?.taskId ?? "unknown-task",
      artifactId,
      moduleId: String(artifact?.payload.moduleId ?? "unknown-module"),
      surfaceVersion: "0.1.0"
    };
  }, []);

  const focusedArtifact = artifacts.find((artifact) => artifact.visible && artifact.state !== "collapsed");

  const value = React.useMemo<RuntimeValue>(() => ({
    tasks,
    chronicle,
    artifacts,
    focusedArtifact,
    actionLog,
    confirmationHistory,
    pendingConfirmation,
    protocolIssue,
    statusText,
    agentTurn,
    submitIntent,
    respondToConfirmation,
    clearProtocolIssue,
    getSurfaceContext,
    host,
    updateArtifactById,
    setRetentionById,
    completeTaskForTask,
    failTaskForTask
  }), [actionLog, agentTurn, artifacts, chronicle, clearProtocolIssue, completeTaskForTask, confirmationHistory, failTaskForTask, focusedArtifact, getSurfaceContext, host, pendingConfirmation, protocolIssue, respondToConfirmation, setRetentionById, statusText, submitIntent, tasks, updateArtifactById]);

  return (
    <RuntimeContext.Provider value={value}>
      <HostContext.Provider value={host}>{props.children}</HostContext.Provider>
    </RuntimeContext.Provider>
  );
}

export function useRuntime() {
  const value = React.useContext(RuntimeContext);
  if (!value) {
    throw new Error("useRuntime must be used inside RuntimeProvider");
  }
  return value;
}

export function SurfaceBoundary(props: { artifact: Artifact; children: React.ReactNode }) {
  const { getSurfaceContext, host, updateArtifactById, setRetentionById, completeTaskForTask, failTaskForTask } = useRuntime();
  const boundHost = React.useMemo<Host>(() => ({
    ...host,
    updateArtifact(patch) {
      updateArtifactById(props.artifact.id, patch);
    },
    setRetention(mode) {
      setRetentionById(props.artifact.id, mode);
    },
    completeTask(summary) {
      completeTaskForTask(props.artifact.taskId, summary);
    },
    failTask(error) {
      failTaskForTask(props.artifact.taskId, error);
    }
  }), [completeTaskForTask, failTaskForTask, host, props.artifact.id, props.artifact.taskId, setRetentionById, updateArtifactById]);
  return (
    <SurfaceContext.Provider value={getSurfaceContext(props.artifact.id)}>
      <HostContext.Provider value={boundHost}>{props.children}</HostContext.Provider>
    </SurfaceContext.Provider>
  );
}
