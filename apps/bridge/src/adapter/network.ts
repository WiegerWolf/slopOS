import { execCommand } from "../tool/exec";
import type { EventState, NetworkConnection, WifiNetwork } from "../tool/types";

export async function getNetworkState(): Promise<{ connections: NetworkConnection[]; wifi: WifiNetwork[] }> {
  const [connResult, wifiResult] = await Promise.all([
    execCommand("nmcli -t -f NAME,TYPE,DEVICE,STATE connection show --active", { timeoutMs: 5000 }),
    execCommand("nmcli -t -f SSID,SIGNAL,SECURITY,ACTIVE device wifi list", { timeoutMs: 10000 })
  ]);

  const connections: NetworkConnection[] = [];
  if (connResult.ok && connResult.stdout.trim()) {
    for (const line of connResult.stdout.trim().split("\n")) {
      const parts = line.split(":");
      if (parts.length >= 4) {
        connections.push({
          name: parts[0],
          type: parts[1],
          device: parts[2],
          state: parts[3]
        });
      }
    }
  }

  const wifi: WifiNetwork[] = [];
  if (wifiResult.ok && wifiResult.stdout.trim()) {
    for (const line of wifiResult.stdout.trim().split("\n")) {
      const parts = line.split(":");
      if (parts.length >= 4 && parts[0]) {
        wifi.push({
          ssid: parts[0],
          signal: parseInt(parts[1], 10) || 0,
          security: parts[2] || "open",
          active: parts[3] === "yes"
        });
      }
    }
  }

  return { connections, wifi };
}

export async function connectWifi(ssid: string, password?: string): Promise<{ ok: boolean; error?: string }> {
  const cmd = password
    ? `nmcli device wifi connect ${JSON.stringify(ssid)} password ${JSON.stringify(password)}`
    : `nmcli device wifi connect ${JSON.stringify(ssid)}`;

  const { ok, stderr } = await execCommand(cmd, { timeoutMs: 30000 });
  return { ok, error: ok ? undefined : stderr || "failed to connect" };
}

export async function disconnectInterface(device: string): Promise<{ ok: boolean; error?: string }> {
  const { ok, stderr } = await execCommand(`nmcli device disconnect ${JSON.stringify(device)}`, { timeoutMs: 10000 });
  return { ok, error: ok ? undefined : stderr || "failed to disconnect" };
}

export async function wifiScan(): Promise<{ ok: boolean }> {
  const { ok } = await execCommand("nmcli device wifi rescan", { timeoutMs: 10000 });
  return { ok };
}

let pollTimer: ReturnType<typeof setInterval> | undefined;

export function pollNetworkState(eventState: EventState, intervalMs = 5000) {
  if (pollTimer) clearInterval(pollTimer);

  async function poll() {
    try {
      const state = await getNetworkState();
      eventState["network.state"] = state;
    } catch {
      // silently skip poll failures
    }
  }

  void poll();
  pollTimer = setInterval(poll, intervalMs);
}
