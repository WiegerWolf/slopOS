import React from "react";
import { Badge, Button, Card, Column, Row, Text } from "@slopos/ui";
import { useHost, type SurfaceProps } from "@slopos/host";

type Provider = { id: string; name: string; baseUrl: string };

type Config = {
  provider: string;
  model: string;
  baseUrl: string;
  plannerMode: string;
  keys: Record<string, string>;
  providers: Provider[];
};

export const surface = {
  id: "settings-panel",
  title: "Settings",
  version: "0.2.0",
  preferredPlacement: "center",
  defaultRetention: "pinned"
} as const;

const input: React.CSSProperties = {
  flex: 1,
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  background: "rgba(255, 255, 255, 0.04)",
  color: "#e8e4de",
  outline: "none",
  fontFamily: "inherit",
};

export default function SettingsPanel(_props: SurfaceProps<Record<string, unknown>>) {
  const host = useHost();
  const [cfg, setCfg] = React.useState<Config | null>(null);
  const [draft, setDraft] = React.useState({ model: "", key: "", customName: "", customUrl: "" });
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const data = (await res.json()) as Config;
      setCfg(data);
      setDraft((d) => ({ ...d, model: data.model, key: "" }));
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const patch = React.useCallback(async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      await load();
      host.logStatus("saved");
    } catch {
      host.logStatus("save failed");
    } finally {
      setBusy(false);
    }
  }, [load, host]);

  if (!cfg) {
    return (
      <Card title="Settings" subtitle="loading...">
        <Text tone="muted">reading config</Text>
      </Card>
    );
  }

  const hasKey = !!cfg.keys[cfg.provider];

  return (
    <Card title="Settings" subtitle={`${cfg.provider} / ${cfg.model}`}>
      <Column gap={14}>
        {/* ---- model ---- */}
        <Column gap={4}>
          <Text tone="accent">Model</Text>
          <Row gap={6}>
            <input
              style={input}
              value={draft.model}
              onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
              placeholder="model id"
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.model.trim()) void patch({ model: draft.model.trim() });
              }}
            />
            {draft.model !== cfg.model ? (
              <Button onClick={() => void patch({ model: draft.model.trim() })}>set</Button>
            ) : null}
          </Row>
        </Column>

        {/* ---- provider ---- */}
        <Column gap={4}>
          <Text tone="accent">Provider</Text>
          <Row gap={4}>
            {cfg.providers.map((p) => (
              <Button
                key={p.id}
                tone={cfg.provider === p.id ? "primary" : "secondary"}
                onClick={() => void patch({ provider: p.id, baseUrl: p.baseUrl })}
              >
                {p.name}
              </Button>
            ))}
          </Row>
          <Text tone="muted">{cfg.baseUrl}</Text>
        </Column>

        {/* ---- api key ---- */}
        <Column gap={4}>
          <Row gap={6}>
            <Text tone="accent">API Key</Text>
            {hasKey ? <Badge tone="muted">{cfg.keys[cfg.provider]}</Badge> : <Badge tone="secondary">not set</Badge>}
          </Row>
          <Row gap={6}>
            <input
              style={input}
              type="password"
              value={draft.key}
              onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
              placeholder={`key for ${cfg.provider}`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.key.trim()) {
                  void patch({ keys: { [cfg.provider]: draft.key.trim() } });
                  setDraft((d) => ({ ...d, key: "" }));
                }
              }}
            />
            {draft.key.trim() ? (
              <Button onClick={() => {
                void patch({ keys: { [cfg.provider]: draft.key.trim() } });
                setDraft((d) => ({ ...d, key: "" }));
              }}>save</Button>
            ) : null}
          </Row>
        </Column>

        {/* ---- planner mode ---- */}
        <Column gap={4}>
          <Text tone="accent">Planner</Text>
          <Row gap={4}>
            {(["auto", "cloud", "heuristic"] as const).map((m) => (
              <Button key={m} tone={cfg.plannerMode === m ? "primary" : "secondary"} onClick={() => void patch({ plannerMode: m })}>
                {m}
              </Button>
            ))}
          </Row>
        </Column>

        {/* ---- add custom endpoint ---- */}
        {!adding ? (
          <Button tone="secondary" onClick={() => setAdding(true)}>+ endpoint</Button>
        ) : (
          <Column gap={6}>
            <Text tone="accent">Add endpoint</Text>
            <input style={input} placeholder="name" value={draft.customName} onChange={(e) => setDraft((d) => ({ ...d, customName: e.target.value }))} />
            <input style={input} placeholder="base url" value={draft.customUrl} onChange={(e) => setDraft((d) => ({ ...d, customUrl: e.target.value }))} />
            <Row gap={6}>
              <Button onClick={() => {
                const name = draft.customName.trim();
                const url = draft.customUrl.trim();
                if (name && url) {
                  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
                  const custom = [...(cfg.providers.filter((p) =>
                    !["anthropic","openai","google","openrouter","xai","deepseek","mistral","ollama"].includes(p.id)
                  )), { id, name, baseUrl: url }];
                  void patch({ customProviders: custom });
                  setDraft((d) => ({ ...d, customName: "", customUrl: "" }));
                  setAdding(false);
                }
              }}>add</Button>
              <Button tone="secondary" onClick={() => setAdding(false)}>cancel</Button>
            </Row>
          </Column>
        )}

        {busy ? <Text tone="muted">saving...</Text> : null}
      </Column>
    </Card>
  );
}
