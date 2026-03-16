import type { Artifact, ChronicleEntry, Task } from "@slopos/runtime";
import type { ActionLogEntry, ConfirmationRecord } from "./runtime";

export type PersistedShellState = {
  version: number;
  tasks: Task[];
  chronicle: ChronicleEntry[];
  artifacts: Artifact[];
  actionLog: ActionLogEntry[];
  confirmationHistory: ConfirmationRecord[];
  statusText: string;
};

const LEGACY_SHELL_STORAGE_KEYS = ["slopos.shell.state", "slopos.shell.state.v1"];
const SHELL_STORAGE_KEY = "slopos.shell.state.v2";

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
      logs: [],
      summary: {
        title: "Booted shell",
        oneLine: "Started on a calm canvas with one prompt in the center."
      }
    }
  ];
}

function createInitialChronicle(): ChronicleEntry[] {
  return [];
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
      status: "cancelled",
      updatedAt: Date.now(),
      logs: [...task.logs, { timestamp: Date.now(), message: "Recovered after shell reload" }]
    };
  }

  return task;
}

type ArtifactRestoreMetadata = {
  strategy: "surface" | "terminal_surface";
  moduleId?: string;
};

function restoreArtifact(artifact: Artifact): Artifact {
  const restoreMeta = artifact.payload.restoreMeta as ArtifactRestoreMetadata | undefined;
  if (!restoreMeta) {
    return artifact;
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

function migrateShellState(input: Partial<PersistedShellState>): PersistedShellState | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const version = typeof input.version === "number" ? input.version : 0;
  if (version > 2) {
    return null;
  }

  return {
    version: 2,
    tasks: Array.isArray(input.tasks) ? input.tasks.map((task) => restoreTask(task as Task)) : createInitialTasks(),
    chronicle: Array.isArray(input.chronicle) ? input.chronicle as ChronicleEntry[] : createInitialChronicle(),
    artifacts: Array.isArray(input.artifacts) ? (input.artifacts as Artifact[]).map((artifact) => restoreArtifact(artifact)) : [],
    actionLog: Array.isArray(input.actionLog) ? input.actionLog as ActionLogEntry[] : [],
    confirmationHistory: Array.isArray(input.confirmationHistory) ? input.confirmationHistory as ConfirmationRecord[] : [],
    statusText: typeof input.statusText === "string" ? input.statusText : "Hit ` and say what you want."
  };
}

export function loadPersistedShellState(): PersistedShellState | null {
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

export function persistShellState(state: PersistedShellState) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify(state));
}
