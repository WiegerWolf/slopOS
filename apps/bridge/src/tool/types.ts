import type { ToolId, ToolSafety } from "@slopos/runtime";

export type ToolCallInput = {
  name: ToolId | string;
  args?: Record<string, unknown>;
  options?: Record<string, unknown>;
};

export type AudioSink = {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  isDefault: boolean;
};

export type AudioSource = {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  isDefault: boolean;
};

export type NetworkConnection = {
  name: string;
  type: string;
  device: string;
  state: string;
};

export type WifiNetwork = {
  ssid: string;
  signal: number;
  security: string;
  active: boolean;
};

export type EventState = {
  "bluetooth.devices": {
    scanning: boolean;
    devices: Array<{
      id: string;
      name: string;
      paired: boolean;
      connected: boolean;
      battery?: number;
      kind?: string;
    }>;
  };
  "audio.state": {
    sinks: AudioSink[];
    sources: AudioSource[];
  };
  "network.state": {
    connections: NetworkConnection[];
    wifi: WifiNetwork[];
  };
  "system.panic": { active: boolean; reason?: string; timestamp?: number } | undefined;
};

export type ToolResult = {
  ok: boolean;
  output?: unknown;
  error?: string;
  confirmationRequired?: {
    title: string;
    message: string;
  };
  events?: EventState;
};

export type ToolContext = {
  eventState: EventState;
};

export type ToolDefinition = {
  name: ToolId;
  requiresConfirmation?: (input: ToolCallInput) =>
    | {
        title: string;
        message: string;
      }
    | undefined;
  execute(input: ToolCallInput, context: ToolContext): Promise<ToolResult>;
};
