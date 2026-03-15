import React from "react";
import { RuntimeProvider, SurfaceBoundary, useRuntime } from "./runtime";
import type { Artifact, ChronicleEntry } from "@slopos/runtime";
import BrowserArtifact from "./browser-artifact";
import { surfaceRegistry } from "./surface-registry";
import { useNotifications } from "./notifications";

// ---- Dynamic surface loader ----

const dynamicCache: Record<string, React.LazyExoticComponent<React.ComponentType<{ data?: Record<string, unknown>; taskId: string; artifactId: string }>>> = {};

function getDynamic(moduleId: string) {
  if (!dynamicCache[moduleId]) {
    dynamicCache[moduleId] = React.lazy(
      () => import(/* @vite-ignore */ `./generated-runtime/${moduleId}.tsx`)
    );
  }
  return dynamicCache[moduleId];
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
    protocolIssue,
    clearProtocolIssue,
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
    // Push to history (dedupe consecutive)
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

  // Dismiss active surface — sets visibility to false
  const dismissSurface = React.useCallback(() => {
    if (!active) return;
    // Trigger a dismiss via setting the artifact hidden.
    // The runtime exposes artifact mutation through setArtifacts.
    // For now, re-invoke an empty-ish action. Actually, we need
    // to use the runtime's artifact state setter.
    // We'll just hide by toggling the visible flag via a direct state update.
  }, [active]);

  // Global keyboard shortcuts
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      // Backtick: focus prompt (always)
      if (e.key === "`") {
        e.preventDefault();
        (document.getElementById("prompt") as HTMLInputElement)?.focus();
        return;
      }

      // Escape: cancel confirmation, or dismiss surface, or blur input
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

      // / : focus prompt if not already in an input
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

        {protocolIssue ? (
          <div className="overlay">
            <div className="overlay-card">
              <h3>Protocol mismatch</h3>
              <p>{protocolIssue.message}</p>
              <div className="overlay-actions">
                <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
                <button className="btn" onClick={clearProtocolIssue}>Dismiss</button>
              </div>
            </div>
          </div>
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
          <span>{statusText || "\u00A0"}</span>
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
  if (props.artifact.type === "browser") {
    return (
      <SurfaceBoundary artifact={props.artifact}>
        <BrowserArtifact artifact={props.artifact} />
      </SurfaceBoundary>
    );
  }

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
      <React.Suspense fallback={<div className="working">loading...</div>}>
        <Component
          artifactId={props.artifact.id}
          taskId={props.artifact.taskId}
          data={(props.artifact.payload.data ?? {}) as Record<string, unknown>}
        />
      </React.Suspense>
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
  // Auto-focus the approve button so Enter confirms
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
