import { execCommand } from "../tool/exec";
import type { AudioSink, AudioSource, EventState } from "../tool/types";

async function detectBackend(): Promise<"pipewire" | "pulseaudio" | "none"> {
  const wpctl = await execCommand("wpctl status", { timeoutMs: 3000 });
  if (wpctl.ok) return "pipewire";

  const pactl = await execCommand("pactl info", { timeoutMs: 3000 });
  if (pactl.ok) return "pulseaudio";

  return "none";
}

async function getSinksPipewire(): Promise<AudioSink[]> {
  const { ok, stdout } = await execCommand("wpctl status", { timeoutMs: 5000 });
  if (!ok) return [];

  // Parse sinks from wpctl status output
  const sinks: AudioSink[] = [];
  const sinkSection = stdout.match(/Sinks:\n([\s\S]*?)(?:\n\s*\n|\n\S)/);
  if (!sinkSection) return [];

  const lines = sinkSection[1].split("\n");
  for (const line of lines) {
    const match = line.match(/\s*(\*?)\s*(\d+)\.\s+(.+?)(?:\s+\[vol:\s*([\d.]+)\s*(MUTED)?\])?$/);
    if (!match) continue;

    const isDefault = match[1] === "*";
    const id = match[2];
    const name = match[3].trim();
    const vol = match[4] ? parseFloat(match[4]) : 1.0;
    const muted = match[5] === "MUTED";

    sinks.push({
      id,
      name,
      volume: Math.round(vol * 100),
      muted,
      isDefault
    });
  }

  return sinks;
}

async function getSourcesPipewire(): Promise<AudioSource[]> {
  const { ok, stdout } = await execCommand("wpctl status", { timeoutMs: 5000 });
  if (!ok) return [];

  const sources: AudioSource[] = [];
  const sourceSection = stdout.match(/Sources:\n([\s\S]*?)(?:\n\s*\n|\n\S)/);
  if (!sourceSection) return [];

  const lines = sourceSection[1].split("\n");
  for (const line of lines) {
    const match = line.match(/\s*(\*?)\s*(\d+)\.\s+(.+?)(?:\s+\[vol:\s*([\d.]+)\s*(MUTED)?\])?$/);
    if (!match) continue;

    const isDefault = match[1] === "*";
    const id = match[2];
    const name = match[3].trim();
    const vol = match[4] ? parseFloat(match[4]) : 1.0;
    const muted = match[5] === "MUTED";

    sources.push({
      id,
      name,
      volume: Math.round(vol * 100),
      muted,
      isDefault
    });
  }

  return sources;
}

async function getSinksPulse(): Promise<AudioSink[]> {
  const { ok, stdout } = await execCommand("pactl list sinks short", { timeoutMs: 5000 });
  if (!ok) return [];

  const sinks: AudioSink[] = [];
  for (const line of stdout.trim().split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    sinks.push({
      id: parts[0],
      name: parts[1],
      volume: 100,
      muted: false,
      isDefault: false
    });
  }

  // Try to get default sink
  const { stdout: defaultSink } = await execCommand("pactl get-default-sink", { timeoutMs: 3000 });
  const defaultName = defaultSink.trim();
  for (const sink of sinks) {
    if (sink.name === defaultName) sink.isDefault = true;
  }

  return sinks;
}

async function getSourcesPulse(): Promise<AudioSource[]> {
  const { ok, stdout } = await execCommand("pactl list sources short", { timeoutMs: 5000 });
  if (!ok) return [];

  const sources: AudioSource[] = [];
  for (const line of stdout.trim().split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 2) continue;
    sources.push({
      id: parts[0],
      name: parts[1],
      volume: 100,
      muted: false,
      isDefault: false
    });
  }

  return sources;
}

export async function getAudioState(): Promise<{ sinks: AudioSink[]; sources: AudioSource[] }> {
  const backend = await detectBackend();

  if (backend === "pipewire") {
    const [sinks, sources] = await Promise.all([getSinksPipewire(), getSourcesPipewire()]);
    return { sinks, sources };
  }

  if (backend === "pulseaudio") {
    const [sinks, sources] = await Promise.all([getSinksPulse(), getSourcesPulse()]);
    return { sinks, sources };
  }

  return { sinks: [], sources: [] };
}

export async function setVolume(sinkId: string, volume: number): Promise<{ ok: boolean; error?: string }> {
  const backend = await detectBackend();
  const pct = `${Math.max(0, Math.min(150, Math.round(volume)))}%`;

  if (backend === "pipewire") {
    const { ok, stderr } = await execCommand(`wpctl set-volume ${sinkId} ${pct}`, { timeoutMs: 5000 });
    return { ok, error: ok ? undefined : stderr };
  }

  const { ok, stderr } = await execCommand(`pactl set-sink-volume ${sinkId} ${pct}`, { timeoutMs: 5000 });
  return { ok, error: ok ? undefined : stderr };
}

export async function setMute(sinkId: string, muted: boolean): Promise<{ ok: boolean; error?: string }> {
  const backend = await detectBackend();
  const val = muted ? "1" : "0";

  if (backend === "pipewire") {
    const { ok, stderr } = await execCommand(`wpctl set-mute ${sinkId} ${val}`, { timeoutMs: 5000 });
    return { ok, error: ok ? undefined : stderr };
  }

  const { ok, stderr } = await execCommand(`pactl set-sink-mute ${sinkId} ${muted ? "true" : "false"}`, { timeoutMs: 5000 });
  return { ok, error: ok ? undefined : stderr };
}

export async function setDefaultSink(sinkId: string): Promise<{ ok: boolean; error?: string }> {
  const backend = await detectBackend();

  if (backend === "pipewire") {
    const { ok, stderr } = await execCommand(`wpctl set-default ${sinkId}`, { timeoutMs: 5000 });
    return { ok, error: ok ? undefined : stderr };
  }

  const { ok, stderr } = await execCommand(`pactl set-default-sink ${sinkId}`, { timeoutMs: 5000 });
  return { ok, error: ok ? undefined : stderr };
}

export async function setDefaultSource(sourceId: string): Promise<{ ok: boolean; error?: string }> {
  const backend = await detectBackend();

  if (backend === "pipewire") {
    const { ok, stderr } = await execCommand(`wpctl set-default ${sourceId}`, { timeoutMs: 5000 });
    return { ok, error: ok ? undefined : stderr };
  }

  const { ok, stderr } = await execCommand(`pactl set-default-source ${sourceId}`, { timeoutMs: 5000 });
  return { ok, error: ok ? undefined : stderr };
}

let pollTimer: ReturnType<typeof setInterval> | undefined;

export function pollAudioState(eventState: EventState, intervalMs = 3000) {
  if (pollTimer) clearInterval(pollTimer);

  async function poll() {
    try {
      const state = await getAudioState();
      eventState["audio.state"] = state;
    } catch {
      // silently skip poll failures
    }
  }

  void poll();
  pollTimer = setInterval(poll, intervalMs);
}
