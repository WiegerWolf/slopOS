import React from "react";
import { Badge, Button, Card, Column, FactGrid, Row, SectionList, Text } from "@slopos/ui";
import { useHost, type SurfaceProps } from "@slopos/host";

type RuntimeBadge = {
  label: string;
  tone?: "accent" | "muted" | "secondary" | "primary";
};

type RuntimeFact = {
  label: string;
  value: string;
};

type RuntimeSection = {
  title: string;
  lines: string[];
};

type RuntimeData = {
  intent?: string;
  primaryUrl?: string;
  restoredFromPersistence?: boolean;
  restoreStrategy?: string;
  runtime?: {
    title?: string;
    subtitle?: string;
    headline?: string;
    body?: string;
    badges?: RuntimeBadge[];
    facts?: RuntimeFact[];
    sections?: RuntimeSection[];
  };
};

export const surface = {
  id: "runtime-surface",
  title: "Runtime Surface",
  version: "0.1.0",
  preferredPlacement: "center",
  defaultRetention: "pinned"
} as const;

export default function RuntimeSurface(props: SurfaceProps<RuntimeData>) {
  const host = useHost();
  const effectiveIntent = props.data?.intent ?? "build me a music workspace for spotify";
  const runtime = props.data?.runtime ?? {
    title: "Runtime Workspace",
    subtitle: "This TSX file was written by the local bridge at request time.",
    headline: "Current intent",
    body: "In the real system, the cloud model would produce this surface code on the fly. For now, the bridge writes a task-specific module and Vite hot reloads it."
  };

  return (
    <Card title={runtime.title ?? "Runtime Workspace"} subtitle={runtime.subtitle ?? "This TSX file was written by the local bridge at request time."}>
      <Column gap={14}>
        {props.data?.restoredFromPersistence ? (
          <Row gap={10}>
            <Badge tone="muted">restored</Badge>
            {props.data?.restoreStrategy ? <Text tone="muted">strategy: {props.data.restoreStrategy}</Text> : null}
          </Row>
        ) : null}
        <Text>{runtime.headline ?? "Current intent"}: {effectiveIntent}</Text>
        {runtime.body ? <Text tone="muted">{runtime.body}</Text> : null}
        <Row gap={10}>
          <Badge tone="accent">agent-written TSX</Badge>
          <Badge tone="muted">direct host tools</Badge>
          {(runtime.badges ?? []).map((badge) => (
            <Badge key={badge.label} tone={badge.tone ?? "muted"}>{badge.label}</Badge>
          ))}
        </Row>
        <FactGrid items={runtime.facts ?? []} />
        <SectionList sections={runtime.sections ?? []} />
        <Row gap={10}>
          <Button
            onClick={() =>
              host.tool(
                "browser_open",
                { url: props.data?.primaryUrl ?? "https://open.spotify.com" },
                { runAs: "user" }
              )
            }
          >
            Open Web Surface
          </Button>
          <Button
            tone="secondary"
            onClick={async () => {
              const result = await host.tool<{ stdout?: string }>(
                "shell_exec",
                { cmd: "pwd", cwd: "/home/n/slopos" },
                { runAs: "user", timeoutMs: 5000 }
              );
              host.logStatus(result.stdout?.trim() || "shell command finished");
            }}
          >
            Run Shell Action
          </Button>
          <Button
            tone="secondary"
            onClick={async () => {
              const result = await host.tool<{ content?: string }>(
                "fs_read",
                { path: "/home/n/slopos/README.md" },
                { runAs: "user" }
              );
              host.logStatus(result.content ? "Read file from disk" : "File was empty");
            }}
          >
            Read File
          </Button>
        </Row>
      </Column>
    </Card>
  );
}
