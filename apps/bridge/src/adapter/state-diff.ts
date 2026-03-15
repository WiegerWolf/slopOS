import type { EventState } from "../tool/types";

export type StateChangeEvent = {
  key: string;
  kind: "connected" | "disconnected" | "changed" | "appeared" | "disappeared";
  summary: string;
  timestamp: number;
};

type Snapshot = {
  bluetoothConnected: Set<string>;
  audioDefaultSink: string | undefined;
  networkConnections: Set<string>;
  wifiActive: string | undefined;
};

let previous: Snapshot | null = null;
const listeners: Array<(event: StateChangeEvent) => void> = [];

function snapshot(state: EventState): Snapshot {
  const bt = state["bluetooth.devices"];
  const audio = state["audio.state"];
  const net = state["network.state"];

  return {
    bluetoothConnected: new Set(
      (bt?.devices ?? []).filter((d) => d.connected).map((d) => d.name)
    ),
    audioDefaultSink: (audio?.sinks ?? []).find((s) => s.isDefault)?.name,
    networkConnections: new Set((net?.connections ?? []).map((c) => c.name)),
    wifiActive: (net?.wifi ?? []).find((w) => w.active)?.ssid
  };
}

function emit(event: StateChangeEvent) {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // listener errors are non-fatal
    }
  }
}

export function diffEventState(state: EventState) {
  const current = snapshot(state);

  if (!previous) {
    previous = current;
    return;
  }

  const now = Date.now();

  // Bluetooth changes
  for (const name of current.bluetoothConnected) {
    if (!previous.bluetoothConnected.has(name)) {
      emit({ key: "bluetooth", kind: "connected", summary: `${name} connected`, timestamp: now });
    }
  }
  for (const name of previous.bluetoothConnected) {
    if (!current.bluetoothConnected.has(name)) {
      emit({ key: "bluetooth", kind: "disconnected", summary: `${name} disconnected`, timestamp: now });
    }
  }

  // Audio default sink change
  if (current.audioDefaultSink && previous.audioDefaultSink && current.audioDefaultSink !== previous.audioDefaultSink) {
    emit({ key: "audio", kind: "changed", summary: `Audio output changed to ${current.audioDefaultSink}`, timestamp: now });
  }

  // Network connection changes
  for (const name of current.networkConnections) {
    if (!previous.networkConnections.has(name)) {
      emit({ key: "network", kind: "connected", summary: `${name} connected`, timestamp: now });
    }
  }
  for (const name of previous.networkConnections) {
    if (!current.networkConnections.has(name)) {
      emit({ key: "network", kind: "disconnected", summary: `${name} disconnected`, timestamp: now });
    }
  }

  // WiFi change
  if (current.wifiActive !== previous.wifiActive) {
    if (current.wifiActive && !previous.wifiActive) {
      emit({ key: "wifi", kind: "connected", summary: `Connected to ${current.wifiActive}`, timestamp: now });
    } else if (!current.wifiActive && previous.wifiActive) {
      emit({ key: "wifi", kind: "disconnected", summary: `Disconnected from ${previous.wifiActive}`, timestamp: now });
    } else if (current.wifiActive && previous.wifiActive) {
      emit({ key: "wifi", kind: "changed", summary: `WiFi switched from ${previous.wifiActive} to ${current.wifiActive}`, timestamp: now });
    }
  }

  previous = current;
}

export function onStateChange(listener: (event: StateChangeEvent) => void) {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
}
