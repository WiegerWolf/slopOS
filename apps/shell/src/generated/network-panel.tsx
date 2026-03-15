import React from "react";
import { Button, Card, Column, Row, Text, Badge, Meter } from "@slopos/ui";
import { useEvent, useHost, type SurfaceProps } from "@slopos/host";

type NetworkConnection = {
  name: string;
  type: string;
  device: string;
  state: string;
};

type WifiNetwork = {
  ssid: string;
  signal: number;
  security: string;
  active: boolean;
};

type NetworkState = {
  connections: NetworkConnection[];
  wifi: WifiNetwork[];
};

export const surface = {
  id: "network-panel",
  title: "Network Panel",
  version: "0.1.0",
  preferredPlacement: "center",
  defaultRetention: "pinned"
} as const;

export default function NetworkPanel(
  _props: SurfaceProps<Record<string, unknown>>
) {
  const host = useHost();
  const network = useEvent<NetworkState>("network.state");
  const connections = network?.connections ?? [];
  const wifi = network?.wifi ?? [];

  return (
    <Card title="Network" subtitle="Connections and WiFi">
      <Column gap={14}>
        <Text tone="accent">Active Connections</Text>
        {connections.length === 0 ? (
          <Text tone="muted">No active connections.</Text>
        ) : null}
        {connections.map((conn) => (
          <Row key={`${conn.device}-${conn.name}`} gap={8}>
            <Text>{conn.name}</Text>
            <Badge tone="muted">{conn.type}</Badge>
            <Badge tone="secondary">{conn.device}</Badge>
            <Badge tone="accent">{conn.state}</Badge>
            <Button
              tone="secondary"
              onClick={async () => {
                await host.tool(
                  "network_control",
                  { action: "wifi_disconnect", device: conn.device },
                  { confirm: true }
                );
                host.logStatus(`Disconnected ${conn.name}`);
              }}
            >
              Disconnect
            </Button>
          </Row>
        ))}

        <Row gap={8}>
          <Text tone="accent">WiFi Networks</Text>
          <Button
            tone="secondary"
            onClick={async () => {
              await host.tool("network_control", { action: "wifi_scan" });
              host.logStatus("WiFi scan requested");
            }}
          >
            Scan
          </Button>
        </Row>
        {wifi.length === 0 ? (
          <Text tone="muted">No WiFi networks found. Try scanning.</Text>
        ) : null}
        {wifi.map((net) => (
          <Column key={net.ssid} gap={4}>
            <Row gap={8}>
              <Text>{net.ssid}</Text>
              {net.active ? <Badge tone="accent">connected</Badge> : null}
              <Badge tone="muted">{net.security}</Badge>
            </Row>
            <Meter value={net.signal} label={`${net.signal}%`} />
            {!net.active ? (
              <Button
                tone="secondary"
                onClick={async () => {
                  await host.tool(
                    "network_control",
                    { action: "wifi_connect", ssid: net.ssid },
                    { confirm: true }
                  );
                  host.logStatus(`Connecting to ${net.ssid}`);
                }}
              >
                Connect
              </Button>
            ) : null}
          </Column>
        ))}
      </Column>
    </Card>
  );
}
