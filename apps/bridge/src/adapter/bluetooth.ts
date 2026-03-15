import { execCommand } from "../tool/exec";
import type { EventState } from "../tool/types";

type BluetoothDevice = EventState["bluetooth.devices"]["devices"][number];

export async function scanDevices(): Promise<BluetoothDevice[]> {
  const { ok, stdout } = await execCommand("bluetoothctl devices", { timeoutMs: 5000 });
  if (!ok || !stdout.trim()) return [];

  const lines = stdout.trim().split("\n");
  const devices: BluetoothDevice[] = [];

  for (const line of lines) {
    const match = line.match(/^Device\s+([\dA-F:]+)\s+(.+)$/i);
    if (!match) continue;

    const mac = match[1];
    const name = match[2];
    const info = await getDeviceInfo(mac);

    devices.push({
      id: mac,
      name,
      paired: info.paired,
      connected: info.connected,
      battery: info.battery,
      kind: info.kind
    });
  }

  return devices;
}

async function getDeviceInfo(mac: string): Promise<{ paired: boolean; connected: boolean; battery?: number; kind?: string }> {
  const { ok, stdout } = await execCommand(`bluetoothctl info ${mac}`, { timeoutMs: 5000 });
  if (!ok) return { paired: false, connected: false };

  const paired = /Paired:\s*yes/i.test(stdout);
  const connected = /Connected:\s*yes/i.test(stdout);
  const batteryMatch = stdout.match(/Battery Percentage:.*\((\d+)\)/);
  const battery = batteryMatch ? parseInt(batteryMatch[1], 10) : undefined;
  const iconMatch = stdout.match(/Icon:\s*(\S+)/);
  const kind = iconMatch ? iconMatch[1].replace("audio-", "").replace("card", "audio") : undefined;

  return { paired, connected, battery, kind };
}

export async function connectDevice(mac: string): Promise<{ ok: boolean; error?: string }> {
  const { ok, stderr } = await execCommand(`bluetoothctl connect ${mac}`, { timeoutMs: 15000 });
  return { ok, error: ok ? undefined : stderr || "failed to connect" };
}

export async function disconnectDevice(mac: string): Promise<{ ok: boolean; error?: string }> {
  const { ok, stderr } = await execCommand(`bluetoothctl disconnect ${mac}`, { timeoutMs: 10000 });
  return { ok, error: ok ? undefined : stderr || "failed to disconnect" };
}

export async function startScan(): Promise<{ ok: boolean }> {
  // bluetoothctl scan on runs indefinitely; launch in background
  void execCommand("bluetoothctl --timeout 30 scan on", { timeoutMs: 35000 });
  return { ok: true };
}

export async function stopScan(): Promise<{ ok: boolean }> {
  const { ok } = await execCommand("bluetoothctl scan off", { timeoutMs: 5000 });
  return { ok };
}

let pollTimer: ReturnType<typeof setInterval> | undefined;

export function pollBluetoothState(eventState: EventState, intervalMs = 5000) {
  if (pollTimer) clearInterval(pollTimer);

  async function poll() {
    try {
      const devices = await scanDevices();
      const scanning = eventState["bluetooth.devices"]?.scanning ?? false;
      eventState["bluetooth.devices"] = { scanning, devices };
    } catch {
      // silently skip poll failures
    }
  }

  void poll();
  pollTimer = setInterval(poll, intervalMs);
}
