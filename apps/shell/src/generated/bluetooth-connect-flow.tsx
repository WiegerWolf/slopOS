import React from "react";
import { Button, Card, Column, Meter, Row, Text } from "@slopos/ui";
import { useEvent, useHost, type SurfaceProps } from "@slopos/host";

type BluetoothDevice = {
  id: string;
  name: string;
  paired: boolean;
  connected: boolean;
  battery?: number;
  kind?: string;
};

type BluetoothState = {
  scanning: boolean;
  devices: BluetoothDevice[];
};

export const surface = {
  id: "bluetooth-connect-flow",
  title: "Connect Headset",
  version: "0.1.0",
  preferredPlacement: "center",
  defaultRetention: "ephemeral"
} as const;

export default function BluetoothConnectFlow(
  props: SurfaceProps<{ deviceHint?: string }>
) {
  const host = useHost();
  const bluetooth = useEvent<BluetoothState>("bluetooth.devices");
  const devices = (bluetooth?.devices ?? []).filter((device) => device.kind === "audio");

  return (
    <Card title="Bluetooth Headset" subtitle="Generated TSX surface">
      <Column gap={14}>
        <Text tone="muted">
          {bluetooth?.scanning
            ? "Scanning nearby audio devices. Pick the one you want and the host bridge will do the rest."
            : "Device discovery is idle."}
        </Text>
        <Meter value={bluetooth?.scanning ? 68 : 100} label="scan progress" />
        {devices.map((device) => (
          <Button
            key={device.id}
            onClick={async () => {
              await host.tool(
                "system_control",
                {
                  action: "bluetooth.connect_device",
                  args: { id: device.id }
                },
                { runAs: "root" }
              );

              host.logStatus(`Connected ${device.name}`);
              host.setRetention("collapsed");
              host.completeTask({
                title: "Connected Bluetooth headset",
                oneLine: `Connected ${device.name} and left audio output available.`
              });
            }}
          >
            {device.name}
            {typeof device.battery === "number" ? ` (${device.battery}% battery)` : ""}
          </Button>
        ))}
        {!devices.length ? (
          <Text tone="muted">No audio devices surfaced yet. Keep scanning or retry from the prompt.</Text>
        ) : null}
        <Row gap={8}>
          <Button
            tone="secondary"
            onClick={async () => {
              await host.tool("system_control", {
                action: bluetooth?.scanning ? "bluetooth.scan_stop" : "bluetooth.scan_start"
              });
              host.logStatus(bluetooth?.scanning ? "Scan stopped" : "Scanning for devices...");
            }}
          >
            {bluetooth?.scanning ? "Stop Scan" : "Scan"}
          </Button>
          {devices.filter((d) => d.connected).map((device) => (
            <Button
              key={`dc-${device.id}`}
              tone="secondary"
              onClick={async () => {
                await host.tool(
                  "system_control",
                  {
                    action: "bluetooth.disconnect_device",
                    args: { id: device.id }
                  },
                  { confirm: true }
                );
                host.logStatus(`Disconnected ${device.name}`);
              }}
            >
              Disconnect {device.name}
            </Button>
          ))}
        </Row>
        {props.data?.deviceHint ? (
          <Text tone="accent">Hint from planner: {props.data.deviceHint}</Text>
        ) : null}
      </Column>
    </Card>
  );
}
