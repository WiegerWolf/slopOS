import React from "react";
import { Badge, Button, Card, Column, Row, Text } from "@slopos/ui";
import { useHost, type SurfaceProps } from "@slopos/host";
import { CONTRACT_VERSIONS } from "@slopos/runtime";

type ProviderInfo = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  hasKey?: boolean;
  models?: Array<{ id: string; name: string }>;
};

type ConfigState = {
  activeProvider: string;
  activeModel: string;
  plannerMode: string;
  providers: Record<string, ProviderInfo>;
} | null;

export const surface = {
  id: "settings-panel",
  title: "Settings",
  version: "0.1.0",
  preferredPlacement: "center",
  defaultRetention: "pinned"
} as const;

function ProviderCard(props: {
  provider: ProviderInfo;
  isActive: boolean;
  activeModel: string;
  onSelect: (providerId: string, modelId: string) => void;
  onSetKey: (providerId: string, key: string) => void;
}) {
  const [showKeyInput, setShowKeyInput] = React.useState(false);
  const [keyValue, setKeyValue] = React.useState("");

  return (
    <div style={{
      padding: 16,
      borderRadius: 12,
      background: props.isActive ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.02)",
      border: props.isActive ? "1px solid rgba(255, 255, 255, 0.12)" : "1px solid rgba(255, 255, 255, 0.04)"
    }}>
      <Column gap={8}>
        <Row gap={8}>
          <Text>{props.provider.name}</Text>
          {props.isActive ? <Badge tone="accent">active</Badge> : null}
          {props.provider.hasKey ? <Badge tone="muted">key set</Badge> : <Badge tone="secondary">no key</Badge>}
        </Row>
        <Text tone="muted">{props.provider.baseUrl}</Text>

        {(props.provider.models ?? []).length > 0 ? (
          <Row gap={6}>
            {(props.provider.models ?? []).map((model) => (
              <Button
                key={model.id}
                tone={props.isActive && props.activeModel === model.id ? "primary" : "secondary"}
                onClick={() => props.onSelect(props.provider.id, model.id)}
              >
                {model.name}
              </Button>
            ))}
          </Row>
        ) : null}

        <Row gap={6}>
          {!showKeyInput ? (
            <Button tone="secondary" onClick={() => setShowKeyInput(true)}>
              {props.provider.hasKey ? "Update API Key" : "Set API Key"}
            </Button>
          ) : (
            <>
              <input
                type="password"
                value={keyValue}
                onChange={(e) => setKeyValue(e.target.value)}
                placeholder="sk-..."
                style={{
                  flex: 1,
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  background: "rgba(255, 255, 255, 0.04)",
                  color: "#e8e4de",
                  outline: "none",
                  fontFamily: "inherit"
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && keyValue.trim()) {
                    props.onSetKey(props.provider.id, keyValue.trim());
                    setKeyValue("");
                    setShowKeyInput(false);
                  }
                }}
              />
              <Button
                onClick={() => {
                  if (keyValue.trim()) {
                    props.onSetKey(props.provider.id, keyValue.trim());
                    setKeyValue("");
                    setShowKeyInput(false);
                  }
                }}
              >
                Save
              </Button>
              <Button tone="secondary" onClick={() => { setShowKeyInput(false); setKeyValue(""); }}>
                Cancel
              </Button>
            </>
          )}
        </Row>
      </Column>
    </div>
  );
}

function CustomProviderForm(props: { onAdd: (provider: ProviderInfo) => void }) {
  const [open, setOpen] = React.useState(false);
  const [id, setId] = React.useState("");
  const [name, setName] = React.useState("");
  const [baseUrl, setBaseUrl] = React.useState("");
  const [apiKey, setApiKey] = React.useState("");
  const [models, setModels] = React.useState("");

  if (!open) {
    return (
      <Button tone="secondary" onClick={() => setOpen(true)}>
        Add Custom Provider
      </Button>
    );
  }

  const inputStyle: React.CSSProperties = {
    border: "1px solid rgba(36, 31, 23, 0.15)",
    borderRadius: 12,
    padding: "8px 12px",
    fontSize: 13,
    background: "rgba(255, 255, 255, 0.72)",
    outline: "none",
    width: "100%"
  };

  return (
    <div style={{
      padding: 16,
      borderRadius: 12,
      background: "rgba(255, 255, 255, 0.02)",
      border: "1px dashed rgba(255, 255, 255, 0.1)"
    }}>
      <Column gap={8}>
        <Text tone="accent">New Custom Provider</Text>
        <input style={inputStyle} placeholder="Provider ID (e.g. together)" value={id} onChange={(e) => setId(e.target.value)} />
        <input style={inputStyle} placeholder="Display Name (e.g. Together AI)" value={name} onChange={(e) => setName(e.target.value)} />
        <input style={inputStyle} placeholder="Base URL (e.g. https://api.together.xyz/v1)" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        <input style={inputStyle} type="password" placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        <input style={inputStyle} placeholder="Models (comma-separated IDs)" value={models} onChange={(e) => setModels(e.target.value)} />
        <Row gap={6}>
          <Button onClick={() => {
            if (id.trim() && name.trim() && baseUrl.trim()) {
              props.onAdd({
                id: id.trim(),
                name: name.trim(),
                baseUrl: baseUrl.trim(),
                apiKey: apiKey.trim() || undefined,
                models: models.split(",").filter(Boolean).map((m) => ({ id: m.trim(), name: m.trim() }))
              });
              setOpen(false);
              setId(""); setName(""); setBaseUrl(""); setApiKey(""); setModels("");
            }
          }}>
            Add Provider
          </Button>
          <Button tone="secondary" onClick={() => setOpen(false)}>Cancel</Button>
        </Row>
      </Column>
    </div>
  );
}

export default function SettingsPanel(
  _props: SurfaceProps<Record<string, unknown>>
) {
  const host = useHost();
  const [config, setConfig] = React.useState<ConfigState>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const fetchConfig = React.useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json() as { activeProvider: string; activeModel: string; plannerMode: string; providers: Record<string, ProviderInfo> };
      setConfig(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const updateConfig = React.useCallback(async (patch: Record<string, unknown>) => {
    setSaving(true);
    try {
      await fetch("/api/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ protocolVersion: CONTRACT_VERSIONS.bridgeProtocol, ...patch })
      });
      await fetchConfig();
      host.logStatus("Settings saved");
    } catch {
      host.logStatus("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [fetchConfig, host]);

  const selectModel = React.useCallback(async (providerId: string, modelId: string) => {
    await updateConfig({ activeProvider: providerId, activeModel: modelId });
  }, [updateConfig]);

  const setApiKey = React.useCallback(async (providerId: string, key: string) => {
    await updateConfig({ providers: { [providerId]: { apiKey: key } } });
  }, [updateConfig]);

  const addCustomProvider = React.useCallback(async (provider: ProviderInfo) => {
    await updateConfig({
      providers: {
        [provider.id]: {
          id: provider.id,
          name: provider.name,
          baseUrl: provider.baseUrl,
          apiKey: provider.apiKey,
          models: provider.models
        }
      }
    });
  }, [updateConfig]);

  const setPlannerMode = React.useCallback(async (mode: string) => {
    await updateConfig({ plannerMode: mode });
  }, [updateConfig]);

  if (loading || !config) {
    return (
      <Card title="Settings" subtitle="Loading configuration...">
        <Text tone="muted">Reading ~/.slopos/config.json</Text>
      </Card>
    );
  }

  const providers = Object.values(config.providers);

  return (
    <Card title="Settings" subtitle="Model and provider configuration">
      <Column gap={16}>
        <Row gap={8}>
          <Text tone="accent">Active:</Text>
          <Badge tone="accent">{config.providers[config.activeProvider]?.name ?? config.activeProvider}</Badge>
          <Badge tone="muted">{config.activeModel}</Badge>
          {saving ? <Badge tone="muted">saving...</Badge> : null}
        </Row>

        <Column gap={4}>
          <Text tone="accent">Planner Mode</Text>
          <Row gap={6}>
            {(["auto", "cloud", "heuristic"] as const).map((mode) => (
              <Button
                key={mode}
                tone={config.plannerMode === mode ? "primary" : "secondary"}
                onClick={() => void setPlannerMode(mode)}
              >
                {mode}
              </Button>
            ))}
          </Row>
          <Text tone="muted">
            {config.plannerMode === "auto" ? "Uses cloud planner when API key is available, falls back to heuristic." :
             config.plannerMode === "cloud" ? "Always uses cloud planner. Fails if no API key." :
             "Always uses local heuristic planner. No API calls."}
          </Text>
        </Column>

        <Text tone="accent">Providers</Text>
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            isActive={config.activeProvider === provider.id}
            activeModel={config.activeModel}
            onSelect={selectModel}
            onSetKey={setApiKey}
          />
        ))}

        <CustomProviderForm onAdd={addCustomProvider} />
      </Column>
    </Card>
  );
}
