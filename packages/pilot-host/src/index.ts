import * as React from "react";

export type RunAs = "user" | "root";

export type RetentionMode =
  | "ephemeral"
  | "collapsed"
  | "persistent"
  | "pinned"
  | "background";

export type Placement =
  | "center"
  | "sidebar"
  | "overlay"
  | "chronicle"
  | "background_area";

export type ToolCallOptions = {
  runAs?: RunAs;
  confirm?: boolean;
  timeoutMs?: number;
  quiet?: boolean;
};

export type ConfirmationRequest = {
  title: string;
  message: string;
  actionLabel: string;
  cancelLabel: string;
};

export type TaskSummary = {
  title: string;
  oneLine: string;
  outcome?: string;
};

export type TaskFailure = {
  message: string;
  oneLine: string;
  retryable?: boolean;
};

export type SurfaceContextValue = {
  taskId: string;
  artifactId: string;
  moduleId: string;
  surfaceVersion: string;
};

export type Host = {
  tool<TResult = unknown>(
    name: string,
    args?: Record<string, unknown>,
    options?: ToolCallOptions
  ): Promise<TResult>;
  subscribe<T = unknown>(
    source: string,
    filter?: Record<string, unknown>
  ): {
    get(): T | undefined;
    unsubscribe(): void;
  };
  updateArtifact(patch: {
    title?: string;
    retention?: RetentionMode;
    placement?: Placement;
    data?: Record<string, unknown>;
    visible?: boolean;
  }): void;
  setRetention(mode: RetentionMode): void;
  setPlacement(placement: Placement): void;
  requestConfirmation(input: ConfirmationRequest): Promise<boolean>;
  completeTask(summary: TaskSummary): void;
  failTask(error: TaskFailure): void;
  logStatus(statusText: string): void;
};

export const HostContext = React.createContext<Host | null>(null);
export const SurfaceContext = React.createContext<SurfaceContextValue | null>(null);

export type SurfaceProps<TData = Record<string, unknown>> = {
  taskId: string;
  artifactId: string;
  data?: TData;
};

export function useHost(): Host {
  const value = React.useContext(HostContext);
  if (!value) {
    throw new Error("useHost must be used inside HostContext");
  }
  return value;
}

export function useSurfaceContext(): SurfaceContextValue {
  const value = React.useContext(SurfaceContext);
  if (!value) {
    throw new Error("useSurfaceContext must be used inside SurfaceContext");
  }
  return value;
}

export function useEvent<T = unknown>(
  source: string,
  filter?: Record<string, unknown>
): T | undefined {
  const host = useHost();
  const subscriptionRef = React.useRef<ReturnType<Host["subscribe"]> | null>(null);
  const [, forceRender] = React.useReducer((value: number) => value + 1, 0);

  React.useEffect(() => {
    subscriptionRef.current?.unsubscribe();
    const subscription = host.subscribe<T>(source, filter);
    subscriptionRef.current = subscription;
    const timer = window.setInterval(() => forceRender(), 250);

    return () => {
      window.clearInterval(timer);
      subscription.unsubscribe();
    };
  }, [filter, host, source]);

  return subscriptionRef.current?.get() as T | undefined;
}

export function useArtifactState<T>(initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  return React.useState(initial);
}
