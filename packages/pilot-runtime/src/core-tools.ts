export type ToolSafety = "read_only" | "stateful" | "destructive";

export type ToolId =
  | "app_launch"
  | "browser_active_tab"
  | "browser_recent_events"
  | "browser_workspace_claim"
  | "browser_workspace_open_url"
  | "browser_open"
  | "browser_page_snapshot"
  | "browser_session_snapshot"
  | "browser_workspace_detail"
  | "fs_read"
  | "fs_write"
  | "pty_close"
  | "pty_open"
  | "pty_snapshot"
  | "pty_write"
  | "shell_exec"
  | "slopos_runtime_diagnostics"
  | "slopos_session_snapshot"
  | "system_control";

export type ToolDescriptor = {
  id: ToolId;
  description: string;
  safety: ToolSafety;
  mayRequireConfirmation?: boolean;
};

export const toolDescriptors: Record<ToolId, ToolDescriptor> = {
  app_launch: {
    id: "app_launch",
    description: "Launches desktop app",
    safety: "stateful"
  },
  browser_active_tab: {
    id: "browser_active_tab",
    description: "Returns the focused embedded browser tab and workspace",
    safety: "read_only"
  },
  browser_recent_events: {
    id: "browser_recent_events",
    description: "Returns recent browser page-state events observed from embedded browser workspaces",
    safety: "read_only"
  },
  browser_workspace_claim: {
    id: "browser_workspace_claim",
    description: "Claims queued control commands for an embedded browser workspace",
    safety: "read_only"
  },
  browser_workspace_open_url: {
    id: "browser_workspace_open_url",
    description: "Queues a navigation command for an embedded browser workspace",
    safety: "stateful"
  },
  browser_open: {
    id: "browser_open",
    description: "Opens URL in browser",
    safety: "stateful"
  },
  browser_page_snapshot: {
    id: "browser_page_snapshot",
    description: "Returns the visible page snapshot for the focused embedded browser tab",
    safety: "read_only"
  },
  browser_session_snapshot: {
    id: "browser_session_snapshot",
    description: "Returns known embedded browser session state",
    safety: "read_only"
  },
  browser_workspace_detail: {
    id: "browser_workspace_detail",
    description: "Returns detailed state for a specific embedded browser workspace",
    safety: "read_only"
  },
  fs_read: {
    id: "fs_read",
    description: "Reads file from disk",
    safety: "read_only"
  },
  fs_write: {
    id: "fs_write",
    description: "Writes file to disk",
    safety: "destructive",
    mayRequireConfirmation: true
  },
  pty_close: {
    id: "pty_close",
    description: "Closes PTY session",
    safety: "stateful"
  },
  pty_open: {
    id: "pty_open",
    description: "Opens PTY session",
    safety: "stateful"
  },
  pty_snapshot: {
    id: "pty_snapshot",
    description: "Snapshots PTY session",
    safety: "read_only"
  },
  pty_write: {
    id: "pty_write",
    description: "Writes to PTY session",
    safety: "stateful"
  },
  shell_exec: {
    id: "shell_exec",
    description: "Runs shell command",
    safety: "destructive",
    mayRequireConfirmation: true
  },
  slopos_runtime_diagnostics: {
    id: "slopos_runtime_diagnostics",
    description: "Returns bridge diagnostics, versions, and active runtime state",
    safety: "read_only"
  },
  slopos_session_snapshot: {
    id: "slopos_session_snapshot",
    description: "Returns bridge-known slopOS session state",
    safety: "read_only"
  },
  system_control: {
    id: "system_control",
    description: "Runs mocked system control actions",
    safety: "destructive",
    mayRequireConfirmation: true
  }
};

export function getToolDescriptor(id: string) {
  return toolDescriptors[id as ToolId];
}

export function listToolDescriptors() {
  return Object.values(toolDescriptors);
}
