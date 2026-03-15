import React from "react";
import { Button, Card, Column, Meter, Row, Text, Badge } from "@slopos/ui";
import { useEvent, useHost, type SurfaceProps } from "@slopos/host";

type AudioSink = {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  isDefault: boolean;
};

type AudioSource = {
  id: string;
  name: string;
  volume: number;
  muted: boolean;
  isDefault: boolean;
};

type AudioState = {
  sinks: AudioSink[];
  sources: AudioSource[];
};

export const surface = {
  id: "audio-mixer",
  title: "Audio Mixer",
  version: "0.1.0",
  preferredPlacement: "center",
  defaultRetention: "pinned"
} as const;

export default function AudioMixer(
  _props: SurfaceProps<Record<string, unknown>>
) {
  const host = useHost();
  const audio = useEvent<AudioState>("audio.state");
  const sinks = audio?.sinks ?? [];
  const sources = audio?.sources ?? [];

  return (
    <Card title="Audio Mixer" subtitle="System audio control">
      <Column gap={14}>
        <Text tone="accent">Output Devices</Text>
        {sinks.length === 0 ? (
          <Text tone="muted">No audio sinks detected.</Text>
        ) : null}
        {sinks.map((sink) => (
          <Column key={sink.id} gap={6}>
            <Row gap={8}>
              <Text>{sink.name}</Text>
              {sink.isDefault ? <Badge tone="accent">default</Badge> : null}
              {sink.muted ? <Badge tone="muted">muted</Badge> : null}
            </Row>
            <Meter value={sink.muted ? 0 : sink.volume} label={`${sink.volume}%`} />
            <Row gap={8}>
              <Button
                tone="secondary"
                onClick={async () => {
                  await host.tool("audio_control", {
                    action: "set_volume",
                    targetId: sink.id,
                    volume: Math.max(0, sink.volume - 10)
                  });
                }}
              >
                −
              </Button>
              <Button
                tone="secondary"
                onClick={async () => {
                  await host.tool("audio_control", {
                    action: "set_volume",
                    targetId: sink.id,
                    volume: Math.min(150, sink.volume + 10)
                  });
                }}
              >
                +
              </Button>
              <Button
                tone="secondary"
                onClick={async () => {
                  await host.tool("audio_control", {
                    action: "set_mute",
                    targetId: sink.id,
                    muted: !sink.muted
                  });
                }}
              >
                {sink.muted ? "Unmute" : "Mute"}
              </Button>
              {!sink.isDefault ? (
                <Button
                  onClick={async () => {
                    await host.tool("audio_control", {
                      action: "set_default_sink",
                      targetId: sink.id
                    });
                    host.logStatus(`Set ${sink.name} as default output`);
                  }}
                >
                  Set Default
                </Button>
              ) : null}
            </Row>
          </Column>
        ))}

        <Text tone="accent">Input Devices</Text>
        {sources.length === 0 ? (
          <Text tone="muted">No audio sources detected.</Text>
        ) : null}
        {sources.map((source) => (
          <Column key={source.id} gap={6}>
            <Row gap={8}>
              <Text>{source.name}</Text>
              {source.isDefault ? <Badge tone="accent">default</Badge> : null}
              {source.muted ? <Badge tone="muted">muted</Badge> : null}
            </Row>
            <Meter value={source.muted ? 0 : source.volume} label={`${source.volume}%`} />
            <Row gap={8}>
              {!source.isDefault ? (
                <Button
                  tone="secondary"
                  onClick={async () => {
                    await host.tool("audio_control", {
                      action: "set_default_source",
                      targetId: source.id
                    });
                    host.logStatus(`Set ${source.name} as default input`);
                  }}
                >
                  Set Default
                </Button>
              ) : null}
            </Row>
          </Column>
        ))}
      </Column>
    </Card>
  );
}
