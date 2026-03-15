import { getNetworkState, connectWifi, disconnectInterface, wifiScan } from "../adapter/network";
import type { ToolDefinition } from "./types";

export const networkStatusTool: ToolDefinition = {
  name: "network_status",
  async execute(_input, context) {
    const state = await getNetworkState();
    context.eventState["network.state"] = state;

    return {
      ok: true,
      output: state,
      events: context.eventState
    };
  }
};

export const networkControlTool: ToolDefinition = {
  name: "network_control",
  requiresConfirmation(input) {
    const action = String(input.args?.action ?? "");
    if (action === "wifi_connect" || action === "wifi_disconnect") {
      return {
        title: "Confirm network action",
        message: `Allow network action: ${action}?`
      };
    }
    return undefined;
  },
  async execute(input, context) {
    const action = String(input.args?.action ?? "");

    switch (action) {
      case "wifi_connect": {
        const ssid = String(input.args?.ssid ?? "");
        const password = typeof input.args?.password === "string" ? input.args.password : undefined;
        if (!ssid) {
          return { ok: false, error: "ssid is required", events: context.eventState };
        }
        const result = await connectWifi(ssid, password);
        if (!result.ok) {
          return { ok: false, error: result.error, events: context.eventState };
        }
        break;
      }
      case "wifi_disconnect": {
        const device = String(input.args?.device ?? "");
        if (!device) {
          return { ok: false, error: "device is required", events: context.eventState };
        }
        const result = await disconnectInterface(device);
        if (!result.ok) {
          return { ok: false, error: result.error, events: context.eventState };
        }
        break;
      }
      case "wifi_scan": {
        await wifiScan();
        break;
      }
      default:
        return { ok: false, error: `unknown network action: ${action}`, events: context.eventState };
    }

    // Refresh state after change
    const state = await getNetworkState();
    context.eventState["network.state"] = state;

    return {
      ok: true,
      output: { action, state },
      events: context.eventState
    };
  }
};
