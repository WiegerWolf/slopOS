import type { ToolDefinition } from "./types";

export const setThemeTool: ToolDefinition = {
  name: "set_theme",
  execute: async (input, context) => {
    const theme = (input.args as { theme?: string } | undefined)?.theme;

    if (theme !== "light" && theme !== "dark") {
      return {
        ok: false,
        error: 'theme must be "light" or "dark"',
        events: context.eventState
      };
    }

    context.eventState["system.theme"] = { theme };

    return {
      ok: true,
      output: { theme },
      events: context.eventState
    };
  }
};
