import React from "react";
import { Button, Card, Column, Text } from "@slopos/ui";
import { useEvent, useHost, type SurfaceProps } from "@slopos/host";

type PanicState = {
  active: boolean;
  reason?: string;
  timestamp?: number;
};

export const surface = {
  id: "panic-overlay",
  title: "System Panic",
  version: "0.1.0",
  preferredPlacement: "overlay",
  defaultRetention: "pinned"
} as const;

export default function PanicOverlay(
  _props: SurfaceProps<Record<string, unknown>>
) {
  const host = useHost();
  const panic = useEvent<PanicState | undefined>("system.panic");

  if (!panic?.active) return null;

  const time = panic.timestamp ? new Date(panic.timestamp).toLocaleTimeString() : "unknown";

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0, 0, 0, 0.85)",
      backdropFilter: "blur(4px)"
    }}>
      <Card title="System Panic" subtitle="slopOS has entered panic mode">
        <Column gap={14}>
          <Text tone="accent">Reason: {panic.reason ?? "unknown"}</Text>
          <Text tone="muted">Triggered at: {time}</Text>
          <Text tone="muted">
            New turns are blocked until panic is dismissed. Review recent activity before continuing.
          </Text>
          <Button
            onClick={async () => {
              await host.tool("system_control", { action: "panic.dismiss" });
              host.logStatus("Panic mode dismissed");
            }}
          >
            Dismiss Panic
          </Button>
        </Column>
      </Card>
    </div>
  );
}
