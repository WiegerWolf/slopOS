import { getToolDescriptor } from "@slopos/runtime";
import { appLaunchTool, browserActiveTabTool, browserOpenTool, browserPageSnapshotTool, browserRecentEventsTool, browserSessionSnapshotTool, browserWorkspaceClaimTool, browserWorkspaceDetailTool, browserWorkspaceOpenUrlTool } from "./browser";
import { fsReadTool, fsWriteTool } from "./fs";
import { ptyCloseTool, ptyOpenTool, ptySnapshotTool, ptyWriteTool } from "./pty";
import { shellTool } from "./shell";
import { sloposRuntimeDiagnosticsTool, sloposSessionSnapshotTool } from "./session";
import { systemControlTool } from "./system";
import type { ToolCallInput, ToolContext, ToolDefinition, ToolResult } from "./types";

const definitions: ToolDefinition[] = [
  shellTool,
  fsReadTool,
  fsWriteTool,
  browserActiveTabTool,
  browserOpenTool,
  browserPageSnapshotTool,
  browserRecentEventsTool,
  browserSessionSnapshotTool,
  browserWorkspaceClaimTool,
  browserWorkspaceDetailTool,
  browserWorkspaceOpenUrlTool,
  appLaunchTool,
  sloposRuntimeDiagnosticsTool,
  sloposSessionSnapshotTool,
  ptyOpenTool,
  ptyWriteTool,
  ptySnapshotTool,
  ptyCloseTool,
  systemControlTool
];

const registry = new Map(definitions.map((definition) => [definition.name, definition]));

export function listTools() {
  return definitions.map((definition) => {
    const descriptor = getToolDescriptor(definition.name);
    if (!descriptor) {
      throw new Error(`missing shared tool descriptor for ${definition.name}`);
    }

    return {
      ...descriptor,
      requiresConfirmation: definition.requiresConfirmation,
      execute: definition.execute
    };
  });
}

export async function executeTool(input: ToolCallInput, context: ToolContext): Promise<ToolResult> {
  const tool = registry.get(input.name as Parameters<typeof registry.get>[0]);
  if (!tool) {
    return {
      ok: false,
      error: `unknown tool ${input.name}`,
      events: context.eventState
    };
  }

  const confirmation = tool.requiresConfirmation?.(input);
  if (confirmation && input.options?.confirm !== true) {
    return {
      ok: false,
      error: "confirmation required",
      confirmationRequired: confirmation,
      events: context.eventState
    };
  }

  try {
    return await tool.execute(input, context);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "tool execution failed",
      events: context.eventState
    };
  }
}
