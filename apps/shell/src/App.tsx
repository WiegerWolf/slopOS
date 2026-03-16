import React from "react";
import { RuntimeProvider, SurfaceBoundary, useRuntime } from "./runtime";
import type { Artifact, ChronicleEntry } from "@slopos/runtime";
import { surfaceRegistry } from "./surface-registry";


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

// ---- Theme ----

type Theme = "light" | "dark";

function useTheme() {
  const [theme, setThemeState] = React.useState<Theme>(() => {
    const stored = localStorage.getItem("slopos:theme");
    return stored === "light" ? "light" : "dark";
  });

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem("slopos:theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  // Apply on mount
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, []);

  return { theme, setTheme };
}

function ThemeToggle(props: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      className="theme-toggle"
      onClick={props.onToggle}
      title={`Switch to ${props.theme === "dark" ? "light" : "dark"} mode`}
    >
      {props.theme === "dark" ? "\u263C" : "\u263E"}
    </button>
  );
}

// ---- Shell ----

type ConfigState = {
  loaded: boolean;
  configured: boolean;
  providers: Array<{ id: string; name: string; baseUrl: string }>;
  provider: string;
  model: string;
};

function Setup(props: { providers: ConfigState["providers"]; onDone: () => void }) {
  const [provider, setProvider] = React.useState("anthropic");
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState("claude-sonnet-4-6");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const selected = props.providers.find((p) => p.id === provider);

  const save = async () => {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider,
          model,
          baseUrl: selected?.baseUrl,
          keys: { [provider]: apiKey.trim() }
        })
      });
      if (!res.ok) throw new Error("save failed");
      props.onDone();
    } catch {
      setError("failed to save — is the bridge running?");
      setSaving(false);
    }
  };

  return (
    <div className="setup">
      <div className="idle-mark">slopOS</div>
      <div className="setup-subtitle">connect a model to get started</div>
      <div className="setup-form">
        <label className="setup-label">
          provider
          <select
            className="setup-select"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              const p = props.providers.find((p) => p.id === e.target.value);
              if (p?.id === "anthropic") setModel("claude-sonnet-4-6");
              else if (p?.id === "openai") setModel("gpt-4o");
              else if (p?.id === "google") setModel("gemini-2.5-flash");
              else setModel("");
            }}
          >
            {props.providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label className="setup-label">
          API key
          <input
            className="setup-input"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
            autoFocus
          />
        </label>
        <label className="setup-label">
          model
          <input
            className="setup-input"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="model id"
            onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
          />
        </label>
        {error ? <div className="setup-error">{error}</div> : null}
        <button className="btn btn-primary setup-btn" onClick={save} disabled={saving || !apiKey.trim()}>
          {saving ? "saving..." : "connect"}
        </button>
      </div>
    </div>
  );
}

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
  const active = artifacts.find((a) => a.visible);

  const [config, setConfig] = React.useState<ConfigState>({ loaded: false, configured: false, providers: [], provider: "", model: "" });

  React.useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data: { keys: Record<string, string>; providers: ConfigState["providers"]; provider: string; model: string }) => {
        const hasKey = Object.keys(data.keys).length > 0;
        setConfig({ loaded: true, configured: hasKey, providers: data.providers, provider: data.provider, model: data.model });
      })
      .catch(() => setConfig({ loaded: true, configured: false, providers: [], provider: "", model: "" }));
  }, []);

  const idle = !active && !agentTurn;

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

  if (config.loaded && !config.configured) {
    return (
      <div className="shell">
        <div className="canvas">
          <Setup providers={config.providers} onDone={() => setConfig((c) => ({ ...c, configured: true }))} />
        </div>
      </div>
    );
  }

  const promptInput = (
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
  );

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
            <div className="idle-mark">slopOS</div>
            {agentTurn?.statusText ? (
              <div className="working">{agentTurn.statusText}</div>
            ) : null}
            {idle ? promptInput : null}
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

      {/* Dock — only when not idle */}
      {!idle ? (
        <div className="dock">
          {promptInput}

          <div className="status-line">
            <span>
              {agentTurn ? <span className="working-dot" /> : null}
              {statusText || "\u00A0"}
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
  const { theme, setTheme } = useTheme();

  // Watch for LLM-triggered theme changes via bridge events
  React.useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/events");
        if (!res.ok || !active) return;
        const data = (await res.json()) as { events: Record<string, unknown> };
        const themeEvent = data.events["system.theme"] as { theme?: string } | undefined;
        if (themeEvent?.theme === "light" || themeEvent?.theme === "dark") {
          setTheme(themeEvent.theme);
        }
      } catch { /* bridge not ready */ }
    };
    const timer = window.setInterval(poll, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [setTheme]);

  return (
    <RuntimeProvider>
      <ThemeToggle theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} />
      <Shell />
    </RuntimeProvider>
  );
}
