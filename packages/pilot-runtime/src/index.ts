export type TaskStatus =
  | "queued"
  | "planning"
  | "running"
  | "waiting_confirmation"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled";

export type RetentionMode =
  | "ephemeral"
  | "collapsed"
  | "persistent"
  | "pinned"
  | "background";

export type ArtifactType =
  | "surface"
  | "terminal"
  | "file"
  | "note";

export type Task = {
  id: string;
  intent: string;
  createdAt: number;
  updatedAt: number;
  status: TaskStatus;
  source: {
    mode: "text" | "voice";
    rawInput: string;
    wakeMethod: "`" | "alt+space" | "mic" | "other";
  };
  plan: null;
  artifacts: string[];
  chronicleEntryId: string | null;
  parentTaskId: string | null;
  priority: "foreground" | "background";
  logs: Array<{ timestamp: number; message: string }>;
  summary: {
    title: string;
    oneLine: string;
    outcome?: string;
  };
};

export type Artifact = {
  id: string;
  taskId: string;
  type: ArtifactType;
  title: string;
  createdAt: number;
  updatedAt: number;
  state: "active" | "hidden" | "collapsed" | "destroyed" | "background";
  retention: RetentionMode;
  visible: boolean;
  focused: boolean;
  userPinned: boolean;
  userDismissed: boolean;
  recreateCost: "low" | "medium" | "high";
  usefulness: number;
  continuityScore: number;
  isFinalOutput: boolean;
  isScaffolding: boolean;
  isRunning: boolean;
  preview?: {
    kind: "text" | "icon" | "thumbnail" | "status";
    value: string;
  };
  payload: Record<string, unknown>;
};

export type ChronicleEntry = {
  id: string;
  taskId: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  oneLine: string;
  status: "running" | "completed" | "failed" | "cancelled" | "background";
  visibleArtifacts: string[];
  collapsedArtifacts: string[];
  discardedArtifacts: string[];
  tags: string[];
  uiState: {
    expanded: boolean;
    height: "full" | "compact" | "line";
  };
};

export type Operation =
  | {
      type: "set_task_status";
      status: TaskStatus;
      statusText: string;
    }
  | {
      type: "tool_call";
      id: string;
      tool: string;
      args: Record<string, unknown>;
      runAs: "root" | "user";
      async: boolean;
      timeoutMs?: number;
      storeResultAs?: string;
    }
  | {
      type: "write_surface_module";
      module: {
        id: string;
        path: string;
        code: string;
        propsSchema?: Record<string, unknown>;
      };
    }
  | {
      type: "create_artifact";
      artifact: {
        id: string;
        artifactType: ArtifactType;
        title: string;
        renderer: "schema" | "tsx" | "native";
        retention: RetentionMode;
        placement: "center" | "sidebar" | "overlay" | "chronicle" | "background_area";
        payload: Record<string, unknown>;
      };
    }
  | {
      type: "update_artifact";
      artifactId: string;
      patch: Record<string, unknown>;
    }
  | {
      type: "destroy_artifact";
      artifactId: string;
    }
  | {
      type: "set_retention";
      artifactId: string;
      retention: RetentionMode;
      reason: string;
    }
  | {
      type: "request_confirmation";
      confirmation: {
        id: string;
        severity: "low" | "medium" | "high";
        title: string;
        message: string;
        actionLabel: string;
        cancelLabel: string;
        affects: string[];
      };
    }
  | {
      type: "complete_task";
      summary: {
        title: string;
        oneLine: string;
        outcome?: string;
      };
    }
  | {
      type: "fail_task";
      error: {
        message: string;
        retryable: boolean;
        oneLine: string;
      };
    };

export type AgentTurnResponse = {
  taskId: string;
  intent: string;
  mode: "foreground" | "background";
  statusText: string;
  operations: Operation[];
};

export type PlannerSource = "cloud" | "fallback";

type TurnPartBase = {
  id: string;
  turnId: string;
  taskId: string;
  timestamp: number;
};

export type TurnStartPart = TurnPartBase & {
  kind: "turn_start";
  task: Task;
};

export type TurnPlannerPart = TurnPartBase & {
  kind: "planner";
  plannerSource: PlannerSource;
  statusText: string;
};

export type TurnOperationPart = TurnPartBase & {
  kind: "operation";
  operation: Operation;
};

export type TurnToolCallPart = TurnPartBase & {
  kind: "tool_call";
  tool: {
    name: string;
    args?: Record<string, unknown>;
    options?: Record<string, unknown>;
  };
};

export type TurnToolResultPart = TurnPartBase & {
  kind: "tool_result";
  tool: {
    name: string;
  };
  ok: boolean;
  output?: unknown;
  error?: string;
};

export type TurnConfirmationRequestPart = TurnPartBase & {
  kind: "confirmation_request";
  confirmation: {
    id: string;
    title: string;
    message: string;
    tool: {
      name: string;
      args?: Record<string, unknown>;
    };
  };
};

export type TurnConfirmationResultPart = TurnPartBase & {
  kind: "confirmation_result";
  confirmation: {
    id: string;
    approved: boolean;
  };
};

export type TurnErrorPart = TurnPartBase & {
  kind: "turn_error";
  message: string;
};

export type TurnCompletePart = TurnPartBase & {
  kind: "turn_complete";
};

export type TurnPart =
  | TurnStartPart
  | TurnPlannerPart
  | TurnOperationPart
  | TurnToolCallPart
  | TurnToolResultPart
  | TurnConfirmationRequestPart
  | TurnConfirmationResultPart
  | TurnErrorPart
  | TurnCompletePart;

export type TurnStreamEnvelope = {
  part: TurnPart;
};

export type TurnCreateResponse = {
  turnId: string;
  taskId: string;
};

export * from "./core-surfaces";
export * from "./core-tools";
