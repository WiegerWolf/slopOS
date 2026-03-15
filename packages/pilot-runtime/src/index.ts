export type TaskStatus =
  | "queued"
  | "planning"
  | "running"
  | "waiting_confirmation"
  | "blocked"
  | "completed"
  | "failed"
  | "cancelled"
  | "backgrounded";

export type RetentionMode =
  | "ephemeral"
  | "collapsed"
  | "persistent"
  | "pinned"
  | "background";

export type ArtifactType =
  | "surface"
  | "browser"
  | "terminal"
  | "file"
  | "note"
  | "device_panel"
  | "result_card"
  | "progress_card"
  | "external_app"
  | "background_job"
  | "media";

export type TaskEvent = {
  timestamp: number;
  message: string;
};

export type PlanStep = {
  id: string;
  label: string;
  kind: "tool_call" | "ui" | "wait" | "decision" | "launch";
  status: "pending" | "running" | "done" | "failed" | "skipped";
  tool?: string;
  args?: Record<string, unknown>;
  expectedArtifacts?: ArtifactType[];
  reversible?: boolean;
};

export type Plan = {
  goal: string;
  steps: PlanStep[];
  currentStepIndex: number;
  requiresConfirmation: boolean;
  canRunInBackground: boolean;
  restoreStrategy: "resume" | "replay" | "snapshot";
};

export type ConfirmationRequest = {
  id: string;
  taskId: string;
  reason: string;
  severity: "low" | "medium" | "high";
  actionLabel: string;
  expiresAt?: number;
  approved: boolean | null;
};

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
  plan: Plan | null;
  artifacts: string[];
  chronicleEntryId: string | null;
  parentTaskId: string | null;
  priority: "foreground" | "background";
  confirmationRequests: ConfirmationRequest[];
  logs: TaskEvent[];
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
  restoreToken?: string;
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
  resumable: boolean;
  restoreMode: "resume" | "replay" | "snapshot";
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
      type: "subscribe_event";
      subscription: {
        id: string;
        source: string;
        filter?: Record<string, unknown>;
        storeAs?: string;
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
  taskDecision?: {
    policy: "coexist" | "interrupt_current" | "augment_current" | "fork_from_current";
    targetTaskId?: string;
    reason: string;
  };
  operations: Operation[];
};

export type PlannerSource =
  | "cloud"
  | "heuristic"
  | "heuristic_no_key"
  | "heuristic_fallback";

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
  protocolVersion: number;
  part: TurnPart;
};

export type TurnCreateResponse = {
  protocolVersion: number;
  turnId: string;
  taskId: string;
};

export type ProtocolAck = {
  protocolVersion: number;
  ok: boolean;
  error?: string;
  expectedProtocolVersion?: number;
  receivedProtocolVersion?: number;
};

export type SurfaceBuildSuccess = {
  type: "surface_build_success";
  moduleId: string;
  artifactId: string;
  taskId: string;
  path: string;
  outputPath: string;
  version: string;
  exports: {
    hasDefault: boolean;
    hasSurfaceMeta: boolean;
  };
};

export type SurfaceBuildError = {
  type: "surface_build_error";
  moduleId: string;
  artifactId: string;
  taskId: string;
  path: string;
  phase: "validate" | "compile" | "runtime";
  message: string;
  diagnostics: Array<{
    message: string;
    line?: number;
    column?: number;
    frame?: string;
  }>;
  retryable: boolean;
};

export * from "./core-surfaces";
export * from "./core-tools";
export * from "./contract-versions";
