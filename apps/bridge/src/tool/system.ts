import type { ToolDefinition } from "./types";

export const systemControlTool: ToolDefinition = {
  name: "system_control",
  requiresConfirmation(input) {
    const action = String(input.args?.action ?? "");
    if (!action || action === "bluetooth.connect_device") {
      return undefined;
    }

    if (/(shutdown|reboot|power|remove|delete|disable|format|install|uninstall)/.test(action)) {
      return {
        title: "Confirm system action",
        message: `Allow system action ${action}?`
      };
    }

    return undefined;
  },
  async execute(input, context) {
    if (input.args?.action === "bluetooth.connect_device") {
      const targetId = String((input.args.args as { id?: string } | undefined)?.id ?? "");
      context.eventState["bluetooth.devices"] = {
        scanning: false,
        devices: context.eventState["bluetooth.devices"].devices.map((device) => ({
          ...device,
          paired: device.id === targetId ? true : device.paired,
          connected: device.id === targetId
        }))
      };

      return {
        ok: true,
        output: {
          name: input.name,
          action: input.args.action,
          targetId
        },
        events: context.eventState
      };
    }

    return {
      ok: true,
      output: {
        name: input.name,
        args: input.args ?? {},
        options: input.options ?? {}
      },
      events: context.eventState
    };
  }
};
