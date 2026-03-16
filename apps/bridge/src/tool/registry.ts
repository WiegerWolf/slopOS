import { getToolDescriptor } from "@slopos/runtime";
import { appLaunchTool, appListTool, browserOpenTool } from "./browser";
import { fsReadTool, fsWriteTool } from "./fs";
import { ptyCloseTool, ptyOpenTool, ptySnapshotTool, ptyWriteTool } from "./pty";
import { shellTool } from "./shell";
import { sloposRuntimeDiagnosticsTool, sloposSessionSnapshotTool } from "./session";
import { setThemeTool } from "./theme";
import { watchTool, watchListTool, watchCancelTool } from "./watch";
import type { ToolCallInput, ToolContext, ToolDefinition, ToolResult } from "./types";

const definitions: ToolDefinition[] = [
  shellTool,
  fsReadTool,
  fsWriteTool,
  browserOpenTool,
  appLaunchTool,
  appListTool,
  sloposRuntimeDiagnosticsTool,
  sloposSessionSnapshotTool,
  setThemeTool,
  ptyOpenTool,
  ptyWriteTool,
  ptySnapshotTool,
  ptyCloseTool,
  watchTool,
  watchListTool,
  watchCancelTool
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

/**
 * Unwrap double-nested args from surface calls.
 * Surfaces call: tool("shell_exec", { args: { cmd: "..." }, options: { ... } })
 * which arrives as input.args = { args: { cmd: "..." }, options: { ... } }
 * The LLM agent loop already unwraps, but direct host calls don't.
 */
function normalizeInput(input: ToolCallInput): ToolCallInput {
  const args = input.args;
  if (!args) return input;

  // Detect the double-wrap pattern: args has an "args" sub-object
  if (args.args && typeof args.args === "object") {
    return {
      name: input.name,
      args: args.args as Record<string, unknown>,
      options: {
        ...(input.options ?? {}),
        ...((args.options && typeof args.options === "object") ? args.options as Record<string, unknown> : {})
      }
    };
  }

  return input;
}

export async function executeTool(input: ToolCallInput, context: ToolContext): Promise<ToolResult> {
  const normalized = normalizeInput(input);
  const tool = registry.get(normalized.name as Parameters<typeof registry.get>[0]);
  if (!tool) {
    return {
      ok: false,
      error: `unknown tool ${normalized.name}`,
      events: context.eventState
    };
  }

  const confirmation = tool.requiresConfirmation?.(normalized);
  if (confirmation && normalized.options?.confirm !== true) {
    return {
      ok: false,
      error: "confirmation required",
      confirmationRequired: confirmation,
      events: context.eventState
    };
  }

  try {
    return await tool.execute(normalized, context);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "tool execution failed",
      events: context.eventState
    };
  }
}
