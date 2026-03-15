import { getAudioState, setVolume, setMute, setDefaultSink, setDefaultSource } from "../adapter/audio";
import type { ToolDefinition } from "./types";

export const audioStatusTool: ToolDefinition = {
  name: "audio_status",
  async execute(_input, context) {
    const state = await getAudioState();
    context.eventState["audio.state"] = state;

    return {
      ok: true,
      output: state,
      events: context.eventState
    };
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
        const result = await setVolume(targetId, volume);
        if (!result.ok) {
          return { ok: false, error: result.error, events: context.eventState };
        }
        break;
      }
      case "set_mute": {
        const muted = input.args?.muted === true;
        const result = await setMute(targetId, muted);
        if (!result.ok) {
          return { ok: false, error: result.error, events: context.eventState };
        }
        break;
      }
      case "set_default_sink": {
        const result = await setDefaultSink(targetId);
        if (!result.ok) {
          return { ok: false, error: result.error, events: context.eventState };
        }
        break;
      }
      case "set_default_source": {
        const result = await setDefaultSource(targetId);
        if (!result.ok) {
          return { ok: false, error: result.error, events: context.eventState };
        }
        break;
      }
      default:
        return { ok: false, error: `unknown audio action: ${action}`, events: context.eventState };
    }

    // Refresh state after change
    const state = await getAudioState();
    context.eventState["audio.state"] = state;

    return {
      ok: true,
      output: { action, targetId, state },
      events: context.eventState
    };
  }
};
