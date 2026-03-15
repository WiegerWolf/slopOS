import type { ToolId, ToolSafety } from "@slopos/runtime";

export type ToolCallInput = {
  name: ToolId | string;
  args?: Record<string, unknown>;
  options?: Record<string, unknown>;
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
