import React from "react";
import AudioMixer from "./generated/audio-mixer";
import BluetoothConnectFlow from "./generated/bluetooth-connect-flow";
import BrowserInspector from "./generated/browser-inspector";
import CodingWorkspace from "./generated/coding-workspace";
import DiagnosticsInspector from "./generated/diagnostics-inspector";
import NetworkPanel from "./generated/network-panel";
import PanicOverlay from "./generated/panic-overlay";
import SessionInspector from "./generated/session-inspector";
import SettingsPanel from "./generated/settings-panel";

const TerminalSurface = React.lazy(() => import("./generated/terminal-surface"));
const RuntimeSurface = React.lazy(() => import("../generated/runtime-surface"));

export type SurfaceComponentProps = {
  data?: Record<string, unknown>;
  taskId: string;
  artifactId: string;
};

export const surfaceRegistry: Record<string, React.ComponentType<SurfaceComponentProps>> = {
  "audio-mixer": AudioMixer,
  "bluetooth-connect-flow": BluetoothConnectFlow,
  "browser-inspector": BrowserInspector,
  "coding-workspace": CodingWorkspace,
  "diagnostics-inspector": DiagnosticsInspector,
  "network-panel": NetworkPanel,
  "panic-overlay": PanicOverlay,
  "session-inspector": SessionInspector,
  "settings-panel": SettingsPanel,
  "terminal-surface": TerminalSurface,
  "runtime-surface": RuntimeSurface
};
