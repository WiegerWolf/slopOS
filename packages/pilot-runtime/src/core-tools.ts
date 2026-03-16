export type ToolSafety = "read_only" | "stateful" | "destructive";

export type ToolId =
  | "app_launch"
  | "app_list"
  | "browser_open"
  | "fs_read"
  | "fs_write"
  | "pty_close"
  | "pty_open"
  | "pty_snapshot"
  | "pty_write"
  | "set_theme"
  | "shell_exec"
  | "slopos_runtime_diagnostics"
  | "slopos_session_snapshot"
  | "watch"
  | "watch_list"
  | "watch_cancel";

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
  app_list: {
    id: "app_list",
    description: "Lists available desktop apps and tracked launched processes",
    safety: "read_only"
  },
  browser_open: {
    id: "browser_open",
    description: "Opens URL in browser",
    safety: "stateful"
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
  set_theme: {
    id: "set_theme",
    description: "Sets the slopOS shell theme to light or dark",
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
    description: "Returns bridge diagnostics and active runtime state",
    safety: "read_only"
  },
  slopos_session_snapshot: {
    id: "slopos_session_snapshot",
    description: "Returns bridge-known slopOS session state",
    safety: "read_only"
  },
  watch: {
    id: "watch",
    description: "Starts a background watch — runs a shell command and fires a new agent turn when it exits",
    safety: "stateful"
  },
  watch_list: {
    id: "watch_list",
    description: "Lists active watches",
    safety: "read_only"
  },
  watch_cancel: {
    id: "watch_cancel",
    description: "Cancels an active watch by id",
    safety: "stateful"
  }
};

export function getToolDescriptor(id: string) {
  return toolDescriptors[id as ToolId];
}

export function listToolDescriptors() {
  return Object.values(toolDescriptors);
}
