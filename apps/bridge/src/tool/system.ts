import { connectDevice, disconnectDevice, startScan, stopScan } from "../adapter/bluetooth";
import { exitPanicMode } from "../session/panic";
import type { ToolDefinition } from "./types";

export const systemControlTool: ToolDefinition = {
  name: "system_control",
  requiresConfirmation(input) {
    const action = String(input.args?.action ?? "");
    if (!action || action === "bluetooth.connect_device" || action === "bluetooth.scan_start" || action === "bluetooth.scan_stop" || action === "panic.dismiss") {
      return undefined;
    }

    if (action === "bluetooth.disconnect_device") {
      return {
        title: "Confirm Bluetooth disconnect",
        message: "Disconnect this Bluetooth device?"
      };
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
    const action = String(input.args?.action ?? "");

    if (action === "bluetooth.connect_device") {
      const targetId = String((input.args?.args as { id?: string } | undefined)?.id ?? "");
      const result = await connectDevice(targetId);

      if (!result.ok) {
        return { ok: false, error: result.error, events: context.eventState };
      }

      // Update local state optimistically
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
        output: { name: input.name, action, targetId },
        events: context.eventState
      };
    }

    if (action === "bluetooth.disconnect_device") {
      const targetId = String((input.args?.args as { id?: string } | undefined)?.id ?? "");
      const result = await disconnectDevice(targetId);

      if (!result.ok) {
        return { ok: false, error: result.error, events: context.eventState };
      }

      context.eventState["bluetooth.devices"] = {
        ...context.eventState["bluetooth.devices"],
        devices: context.eventState["bluetooth.devices"].devices.map((device) => ({
          ...device,
          connected: device.id === targetId ? false : device.connected
        }))
      };

      return {
        ok: true,
        output: { name: input.name, action, targetId },
        events: context.eventState
      };
    }

    if (action === "bluetooth.scan_start") {
      await startScan();
      context.eventState["bluetooth.devices"] = {
        ...context.eventState["bluetooth.devices"],
        scanning: true
      };
      return { ok: true, output: { action }, events: context.eventState };
    }

    if (action === "bluetooth.scan_stop") {
      await stopScan();
      context.eventState["bluetooth.devices"] = {
        ...context.eventState["bluetooth.devices"],
        scanning: false
      };
      return { ok: true, output: { action }, events: context.eventState };
    }

    if (action === "panic.dismiss") {
      exitPanicMode(context.eventState);
      return { ok: true, output: { action }, events: context.eventState };
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
