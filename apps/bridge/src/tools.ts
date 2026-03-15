import { getTerminalSnapshot } from "./tool/pty";
import { executeTool } from "./tool/registry";
import type { EventState, ToolCallInput, ToolResult } from "./tool/types";

export async function handleToolCall(body: ToolCallInput, eventState: EventState): Promise<ToolResult> {
  return executeTool(body, { eventState });
}

export { getTerminalSnapshot };
export type { EventState, ToolCallInput, ToolResult };
