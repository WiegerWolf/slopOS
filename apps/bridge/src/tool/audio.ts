import { execCommand } from "./exec";
import type { AudioSink, AudioSource, ToolDefinition } from "./types";

async function getAudioState() {
  const [sinksResult, sourcesResult] = await Promise.all([
    execCommand("pactl -f json list sinks", { timeoutMs: 5000 }),
    execCommand("pactl -f json list sources", { timeoutMs: 5000 })
  ]);

  const sinks: AudioSink[] = [];
  const sources: AudioSource[] = [];

  try {
    const raw = JSON.parse(sinksResult.stdout) as Array<Record<string, unknown>>;
    const defaultSink = (await execCommand("pactl get-default-sink", { timeoutMs: 3000 })).stdout.trim();
    for (const s of raw) {
      sinks.push({
        id: String(s.index ?? s.name ?? ""),
        name: String((s.description as string) ?? s.name ?? ""),
        volume: Math.round(Number((s.volume as Record<string, { value_percent?: string }>)?.["front-left"]?.value_percent?.replace("%", "") ?? 0)),
        muted: s.mute === true,
        isDefault: String(s.name ?? "") === defaultSink
      });
    }
  } catch { /* pactl unavailable */ }

  try {
    const raw = JSON.parse(sourcesResult.stdout) as Array<Record<string, unknown>>;
    const defaultSource = (await execCommand("pactl get-default-source", { timeoutMs: 3000 })).stdout.trim();
    for (const s of raw) {
      if (String(s.name ?? "").includes(".monitor")) continue;
      sources.push({
        id: String(s.index ?? s.name ?? ""),
        name: String((s.description as string) ?? s.name ?? ""),
        volume: Math.round(Number((s.volume as Record<string, { value_percent?: string }>)?.["front-left"]?.value_percent?.replace("%", "") ?? 0)),
        muted: s.mute === true,
        isDefault: String(s.name ?? "") === defaultSource
      });
    }
  } catch { /* pactl unavailable */ }

  return { sinks, sources };
}

export const audioStatusTool: ToolDefinition = {
  name: "audio_status",
  async execute(_input, context) {
    const state = await getAudioState();
    context.eventState["audio.state"] = state;
    return { ok: true, output: state, events: context.eventState };
  }
};

export const audioControlTool: ToolDefinition = {
  name: "audio_control",
  async execute(input, context) {
    const action = String(input.args?.action ?? "");
    const targetId = String(input.args?.targetId ?? "");

    switch (action) {
      case "set_volume": {
        const volume = typeof input.args?.volume === "number" ? input.args.volume : 50;
        const result = await execCommand(`pactl set-sink-volume ${targetId} ${volume}%`, { timeoutMs: 5000 });
        if (!result.ok) return { ok: false, error: result.stderr || "failed to set volume", events: context.eventState };
        break;
      }
      case "set_mute": {
        const muted = input.args?.muted === true;
        const result = await execCommand(`pactl set-sink-mute ${targetId} ${muted ? 1 : 0}`, { timeoutMs: 5000 });
        if (!result.ok) return { ok: false, error: result.stderr || "failed to set mute", events: context.eventState };
        break;
      }
      case "set_default_sink": {
        const result = await execCommand(`pactl set-default-sink ${targetId}`, { timeoutMs: 5000 });
        if (!result.ok) return { ok: false, error: result.stderr || "failed to set default sink", events: context.eventState };
        break;
      }
      case "set_default_source": {
        const result = await execCommand(`pactl set-default-source ${targetId}`, { timeoutMs: 5000 });
        if (!result.ok) return { ok: false, error: result.stderr || "failed to set default source", events: context.eventState };
        break;
      }
      default:
        return { ok: false, error: `unknown audio action: ${action}`, events: context.eventState };
    }

    const state = await getAudioState();
    context.eventState["audio.state"] = state;
    return { ok: true, output: { action, targetId, state }, events: context.eventState };
  }
};
