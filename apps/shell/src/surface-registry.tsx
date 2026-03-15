import React from "react";
import BluetoothConnectFlow from "./generated/bluetooth-connect-flow";
import BrowserInspector from "./generated/browser-inspector";
import CodingWorkspace from "./generated/coding-workspace";
import DiagnosticsInspector from "./generated/diagnostics-inspector";
import SessionInspector from "./generated/session-inspector";

const TerminalSurface = React.lazy(() => import("./generated/terminal-surface"));
const RuntimeSurface = React.lazy(() => import("./generated-runtime/runtime-surface"));

export type SurfaceComponentProps = {
  data?: Record<string, unknown>;
  taskId: string;
  artifactId: string;
};

export const surfaceRegistry: Record<string, React.ComponentType<SurfaceComponentProps>> = {
  "bluetooth-connect-flow": BluetoothConnectFlow,
  "browser-inspector": BrowserInspector,
  "coding-workspace": CodingWorkspace,
  "diagnostics-inspector": DiagnosticsInspector,
  "session-inspector": SessionInspector,
  "terminal-surface": TerminalSurface,
  "runtime-surface": RuntimeSurface
};
