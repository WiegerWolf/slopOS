import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ToolDefinition } from "./types";

export const fsReadTool: ToolDefinition = {
  name: "fs_read",
  async execute(input, context) {
    const path = String(input.args?.path ?? "");
    const content = await readFile(path, "utf8");
    return {
      ok: true,
      output: { path, content },
      events: context.eventState
    };
  }
};

export const fsWriteTool: ToolDefinition = {
  name: "fs_write",
  requiresConfirmation(input) {
    const path = String(input.args?.path ?? "this path");
    return {
      title: "Confirm file write",
      message: `Write changes to ${path}?`
    };
  },
  async execute(input, context) {
    const path = String(input.args?.path ?? "");
    const content = String(input.args?.content ?? "");
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf8");
    return {
      ok: true,
      output: { path, bytes: content.length },
      events: context.eventState
    };
  }
};
