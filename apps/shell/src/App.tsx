import React from "react";
import { RuntimeProvider, SurfaceBoundary, useRuntime } from "./runtime";
import type { Artifact, ChronicleEntry } from "@slopos/runtime";
import { surfaceRegistry } from "./surface-registry";
import { useNotifications } from "./notifications";

// ---- Dynamic surface loader ----

type SurfaceComponentProps = { data?: Record<string, unknown>; taskId: string; artifactId: string };

const dynamicCache: Record<string, React.LazyExoticComponent<React.ComponentType<SurfaceComponentProps>>> = {};

function getDynamic(moduleId: string) {
  if (!dynamicCache[moduleId]) {
    const ts = Date.now();
    const importFn = (): Promise<{ default: React.ComponentType<SurfaceComponentProps> }> =>
      import(/* @vite-ignore */ `../generated/${moduleId}.tsx?t=${ts}`).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        return {
          default: ((_props: SurfaceComponentProps) =>
            React.createElement("div", { style: { color: "#c44", padding: 16, fontSize: 13, whiteSpace: "pre-wrap" } },
              `Surface failed to load: ${message}`
            )) as React.ComponentType<SurfaceComponentProps>
        };
      });
    dynamicCache[moduleId] = React.lazy(importFn);
  }
  return dynamicCache[moduleId];
}

// ---- Error boundary for surfaces ----

class SurfaceErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  render() {
    if (this.state.error) {
      return React.createElement("div", { style: { color: "#c44", padding: 16, fontSize: 13, whiteSpace: "pre-wrap" } },
        `Surface render error: ${this.state.error}`
      );
    }
    return this.props.children;
  }
}

// ---- Shell ----

function Shell() {
  const {
    artifacts,
    chronicle,
    statusText,
    submitIntent,
    agentTurn,
    pendingConfirmation,
    respondToConfirmation
  } = useRuntime();

  const [input, setInput] = React.useState("");
  const [history] = React.useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("slopos:prompt-history") ?? "[]"); }
    catch { return []; }
  });
  const histIdx = React.useRef(-1);
  const stash = React.useRef("");
  const { notifications, dismiss } = useNotifications();
  const active = artifacts.find((a) => a.visible);

  const invoke = React.useCallback(async () => {
    const text = input.trim();
    if (!text) return;
    if (history[0] !== text) history.unshift(text);
    if (history.length > 100) history.length = 100;
    localStorage.setItem("slopos:prompt-history", JSON.stringify(history));
    histIdx.current = -1;
    stash.current = "";
    setInput("");
    await submitIntent(text);
  }, [input, submitIntent, history]);

  const historyNav = React.useCallback((dir: "up" | "down") => {
    if (history.length === 0) return;
    if (dir === "up") {
      if (histIdx.current < 0) stash.current = input;
      const next = Math.min(histIdx.current + 1, history.length - 1);
      histIdx.current = next;
      setInput(history[next]);
    } else {
      const next = histIdx.current - 1;
      if (next < 0) {
        histIdx.current = -1;
        setInput(stash.current);
      } else {
        histIdx.current = next;
        setInput(history[next]);
      }
    }
  }, [history, input]);

  // Global keyboard shortcuts
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if (e.key === "`") {
        e.preventDefault();
        (document.getElementById("prompt") as HTMLInputElement)?.focus();
        return;
      }

      if (e.key === "Escape") {
        if (pendingConfirmation) {
          respondToConfirmation(false);
          return;
        }
        if (isInput) {
          (target as HTMLElement).blur();
          return;
        }
        return;
      }

      if (e.key === "/" && !isInput) {
        e.preventDefault();
        (document.getElementById("prompt") as HTMLInputElement)?.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingConfirmation, respondToConfirmation]);

  return (
    <div className="shell">
      {/* Canvas */}
      <div className="canvas">
        {active ? (
          <div className="surface-wrap">
            <Surface artifact={active} />
          </div>
        ) : (
          <div className="idle">
            <div className="idle-mark">slop</div>
            {agentTurn?.statusText ? (
              <div className="working">{agentTurn.statusText}</div>
            ) : (
              <div className="idle-hint">press / or ` to start</div>
            )}
          </div>
        )}

        {pendingConfirmation ? (
          <Confirm
            title={pendingConfirmation.title}
            message={pendingConfirmation.message}
            actionLabel={pendingConfirmation.actionLabel}
            cancelLabel={pendingConfirmation.cancelLabel}
            onApprove={() => respondToConfirmation(true)}
            onDeny={() => respondToConfirmation(false)}
          />
        ) : null}
      </div>

      {/* Dock */}
      <div className="dock">
        <div className="prompt-row">
          <input
            id="prompt"
            className="prompt-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void invoke();
              else if (e.key === "ArrowUp") { e.preventDefault(); historyNav("up"); }
              else if (e.key === "ArrowDown") { e.preventDefault(); historyNav("down"); }
            }}
            placeholder="what do you need?"
            autoFocus
          />
        </div>

        <div className="status-line">
          <span>
            {agentTurn ? <span className="working-dot" /> : null}
            {statusText || "\u00A0"}
          </span>
          <span>
            <kbd>`</kbd> focus
            {" "}
            <kbd>Esc</kbd> dismiss
          </span>
        </div>

        {chronicle.length > 0 ? (
          <div className="chronicle">
            {chronicle.slice(0, 15).map((entry) => (
              <ChronicleChip
                key={entry.id}
                entry={entry}
                onClick={() => void submitIntent(entry.title)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Toasts */}
      {notifications.length > 0 ? (
        <div className="toast-rail">
          {notifications.map((n) => (
            <div key={n.id} className="toast">
              <span>{n.summary}</span>
              <button className="toast-dismiss" onClick={() => dismiss(n.id)}>x</button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---- Surface rendering ----

function Surface(props: { artifact: Artifact }) {
  const moduleId = String(props.artifact.payload.moduleId ?? "");
  let Component = surfaceRegistry[moduleId];

  if (!Component && moduleId.startsWith("gen-")) {
    Component = getDynamic(moduleId);
  }

  if (!Component) {
    return <div style={{ color: "#777", fontSize: 13 }}>unknown surface: {moduleId}</div>;
  }

  return (
    <SurfaceBoundary artifact={props.artifact}>
      <SurfaceErrorBoundary>
        <React.Suspense fallback={<div className="working">loading...</div>}>
          <Component
            artifactId={props.artifact.id}
            taskId={props.artifact.taskId}
            data={(props.artifact.payload.data ?? {}) as Record<string, unknown>}
          />
        </React.Suspense>
      </SurfaceErrorBoundary>
    </SurfaceBoundary>
  );
}

// ---- Chronicle chip ----

function ChronicleChip(props: { entry: ChronicleEntry; onClick: () => void }) {
  return (
    <button
      className={`chronicle-chip ${props.entry.status}`}
      onClick={props.onClick}
      title={props.entry.oneLine}
    >
      {props.entry.title}
    </button>
  );
}

// ---- Confirmation overlay ----

function Confirm(props: {
  title: string;
  message: string;
  actionLabel: string;
  cancelLabel: string;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const approveRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => { approveRef.current?.focus(); }, []);

  return (
    <div className="overlay">
      <div className="overlay-card">
        <h3>{props.title}</h3>
        <p>{props.message}</p>
        <div className="overlay-actions">
          <button ref={approveRef} className="btn btn-primary" onClick={props.onApprove}>{props.actionLabel}</button>
          <button className="btn" onClick={props.onDeny}>{props.cancelLabel} <kbd style={{ fontSize: 10, color: "#666" }}>Esc</kbd></button>
        </div>
      </div>
    </div>
  );
}

// ---- Root ----

export default function App() {
  return (
    <RuntimeProvider>
      <Shell />
    </RuntimeProvider>
  );
}
