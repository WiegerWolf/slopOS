import { execCommand } from "./exec";
import type { NetworkConnection, WifiNetwork, ToolDefinition } from "./types";

async function getNetworkState() {
  const connections: NetworkConnection[] = [];
  const wifi: WifiNetwork[] = [];

  const connResult = await execCommand("nmcli -t -f NAME,TYPE,DEVICE,STATE connection show --active", { timeoutMs: 5000 });
  if (connResult.ok) {
    for (const line of connResult.stdout.trim().split("\n").filter(Boolean)) {
      const [name, type, device, state] = line.split(":");
      if (name) connections.push({ name, type: type ?? "", device: device ?? "", state: state ?? "" });
    }
  }

  const wifiResult = await execCommand("nmcli -t -f SSID,SIGNAL,SECURITY,ACTIVE dev wifi list", { timeoutMs: 8000 });
  if (wifiResult.ok) {
    for (const line of wifiResult.stdout.trim().split("\n").filter(Boolean)) {
      const [ssid, signal, security, active] = line.split(":");
      if (ssid) wifi.push({ ssid, signal: Number(signal ?? 0), security: security ?? "", active: active === "yes" });
    }
  }

  return { connections, wifi };
}

export const networkStatusTool: ToolDefinition = {
  name: "network_status",
  async execute(_input, context) {
    const state = await getNetworkState();
    context.eventState["network.state"] = state;
    return { ok: true, output: state, events: context.eventState };
  }
};

export const networkControlTool: ToolDefinition = {
  name: "network_control",
  requiresConfirmation(input) {
    const action = String(input.args?.action ?? "");
    if (action === "wifi_connect" || action === "wifi_disconnect") {
      return { title: "Confirm network action", message: `Allow network action: ${action}?` };
    }
    return undefined;
  },
  async execute(input, context) {
    const action = String(input.args?.action ?? "");

    switch (action) {
      case "wifi_connect": {
        const ssid = String(input.args?.ssid ?? "");
        const password = typeof input.args?.password === "string" ? input.args.password : undefined;
        if (!ssid) return { ok: false, error: "ssid is required", events: context.eventState };
        const cmd = password
          ? `nmcli dev wifi connect ${JSON.stringify(ssid)} password ${JSON.stringify(password)}`
          : `nmcli dev wifi connect ${JSON.stringify(ssid)}`;
        const result = await execCommand(cmd, { timeoutMs: 30000 });
        if (!result.ok) return { ok: false, error: result.stderr || "wifi connect failed", events: context.eventState };
        break;
      }
      case "wifi_disconnect": {
        const device = String(input.args?.device ?? "");
        if (!device) return { ok: false, error: "device is required", events: context.eventState };
        const result = await execCommand(`nmcli dev disconnect ${JSON.stringify(device)}`, { timeoutMs: 10000 });
        if (!result.ok) return { ok: false, error: result.stderr || "disconnect failed", events: context.eventState };
        break;
      }
      case "wifi_scan": {
        await execCommand("nmcli dev wifi rescan", { timeoutMs: 10000 });
        break;
      }
      default:
        return { ok: false, error: `unknown network action: ${action}`, events: context.eventState };
    }

    const state = await getNetworkState();
    context.eventState["network.state"] = state;
    return { ok: true, output: { action, state }, events: context.eventState };
  }
};
