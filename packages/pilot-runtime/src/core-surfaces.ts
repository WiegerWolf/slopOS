export type CoreSurfaceId =
  | "bluetooth-connect-flow"
  | "browser-inspector"
  | "coding-workspace"
  | "diagnostics-inspector"
  | "runtime-surface"
  | "session-inspector"
  | "terminal-surface";

export type ExistingModuleId = Exclude<CoreSurfaceId, "runtime-surface">;

export type CoreSurfaceDescriptor = {
  id: CoreSurfaceId;
  title: string;
  subtitle: string;
  capabilities: string[];
  refreshTool?: string;
};

export const coreSurfaceDescriptors: Record<CoreSurfaceId, CoreSurfaceDescriptor> = {
  "bluetooth-connect-flow": {
    id: "bluetooth-connect-flow",
    title: "Bluetooth Connect Flow",
    subtitle: "Task surface for pairing and connecting audio devices.",
    capabilities: ["bluetooth", "audio routing"]
  },
  "browser-inspector": {
    id: "browser-inspector",
    title: "Browser Session Inspector",
    subtitle: "Persistent browser-state observer for embedded web workspaces.",
    capabilities: ["browser session", "refreshable", "persistent"],
    refreshTool: "browser_session_snapshot"
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
    subtitle: "Persistent runtime diagnostics surface for bridge health, versions, and active state.",
    capabilities: ["diagnostics", "refreshable", "persistent"],
    refreshTool: "slopos_runtime_diagnostics"
  },
  "runtime-surface": {
    id: "runtime-surface",
    title: "Runtime Surface",
    subtitle: "Generated task surface written at runtime by the bridge.",
    capabilities: ["generated UI", "task summary"]
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

export function isExistingModuleId(input: unknown): input is ExistingModuleId {
  return (
    input === "bluetooth-connect-flow" ||
    input === "browser-inspector" ||
    input === "coding-workspace" ||
    input === "diagnostics-inspector" ||
    input === "session-inspector" ||
    input === "terminal-surface"
  );
}
