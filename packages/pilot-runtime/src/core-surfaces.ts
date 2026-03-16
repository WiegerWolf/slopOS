export type CoreSurfaceId =
  | "audio-mixer"
  | "bluetooth-connect-flow"
  | "coding-workspace"
  | "diagnostics-inspector"
  | "network-panel"
  | "panic-overlay"
  | "session-inspector"
  | "settings-panel"
  | "terminal-surface";

export type CoreSurfaceDescriptor = {
  id: CoreSurfaceId;
  title: string;
  subtitle: string;
  capabilities: string[];
  refreshTool?: string;
};

export const coreSurfaceDescriptors: Record<CoreSurfaceId, CoreSurfaceDescriptor> = {
  "audio-mixer": {
    id: "audio-mixer",
    title: "Audio Mixer",
    subtitle: "System audio control with volume sliders, mute toggles, and default device selection.",
    capabilities: ["audio", "volume", "mute", "default sink/source"],
    refreshTool: "audio_status"
  },
  "bluetooth-connect-flow": {
    id: "bluetooth-connect-flow",
    title: "Bluetooth Connect Flow",
    subtitle: "Task surface for pairing and connecting audio devices.",
    capabilities: ["bluetooth", "audio routing"]
  },
  "coding-workspace": {
    id: "coding-workspace",
    title: "Coding Workspace",
    subtitle: "Task-shaped coding cockpit for repo, docs, and shell work.",
    capabilities: ["workspace", "apps", "repo context"]
  },
  "diagnostics-inspector": {
    id: "diagnostics-inspector",
    title: "slopOS Diagnostics",
    subtitle: "Persistent runtime diagnostics surface for bridge health and active state.",
    capabilities: ["diagnostics", "refreshable", "persistent"],
    refreshTool: "slopos_runtime_diagnostics"
  },
  "network-panel": {
    id: "network-panel",
    title: "Network Panel",
    subtitle: "Active connections and WiFi network management.",
    capabilities: ["network", "wifi", "connections"],
    refreshTool: "network_status"
  },
  "panic-overlay": {
    id: "panic-overlay",
    title: "System Panic",
    subtitle: "Full-screen overlay shown when slopOS enters panic mode.",
    capabilities: ["panic", "recovery"]
  },
  "settings-panel": {
    id: "settings-panel",
    title: "Settings",
    subtitle: "Model and provider configuration panel.",
    capabilities: ["settings", "config", "provider", "model"]
  },
  "session-inspector": {
    id: "session-inspector",
    title: "slopOS Session Inspector",
    subtitle: "Persistent shell-state observer for artifacts, Chronicle, and confirmations.",
    capabilities: ["session state", "refreshable", "persistent"],
    refreshTool: "slopos_session_snapshot"
  },
  "terminal-surface": {
    id: "terminal-surface",
    title: "Terminal Workspace",
    subtitle: "Live PTY-backed shell surface with persistence-aware reattach.",
    capabilities: ["pty", "shell", "persistent"]
  }
};

export function getCoreSurfaceDescriptor(id: string) {
  return coreSurfaceDescriptors[id as CoreSurfaceId];
}

export function listCoreSurfaceDescriptors() {
  return Object.values(coreSurfaceDescriptors);
}

export function isExistingModuleId(input: unknown): input is CoreSurfaceId {
  return typeof input === "string" && input in coreSurfaceDescriptors;
}
