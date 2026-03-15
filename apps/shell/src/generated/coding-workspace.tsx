import React from "react";
import { Button, Card, Column, Row, Text } from "@slopos/ui";
import { useHost, type SurfaceProps } from "@slopos/host";

export const surface = {
  id: "coding-workspace",
  title: "Coding Workspace",
  version: "0.1.0",
  preferredPlacement: "center",
  defaultRetention: "pinned"
} as const;

export default function CodingWorkspace(
  props: SurfaceProps<{ repo?: string; docsUrl?: string; restoredFromPersistence?: boolean; restoreStrategy?: string }>
) {
  const host = useHost();

  return (
    <Card title="Coding Workspace" subtitle="Generated TSX surface">
      <Column gap={14}>
        {props.data?.restoredFromPersistence ? (
          <Row gap={10}>
            <Text tone="accent">Restored from persisted shell state.</Text>
            {props.data?.restoreStrategy ? <Text tone="muted">strategy: {props.data.restoreStrategy}</Text> : null}
          </Row>
        ) : null}
        <Text>
          A richer task surface can stay around after setup while its scaffolding collapses into the Chronicle.
        </Text>
        <Row gap={10}>
          <Button
            onClick={() => host.tool("app_launch", { command: "code ." }, { runAs: "user" })}
          >
            Launch Editor
          </Button>
          <Button
            tone="secondary"
            onClick={() =>
              host.tool(
                "browser_open",
                { url: props.data?.docsUrl ?? "https://react.dev" },
                { runAs: "user" }
              )
            }
          >
            Open Docs
          </Button>
          <Button
            tone="secondary"
            onClick={async () => {
              const result = await host.tool<{ stdout?: string }>(
                "shell_exec",
                { cmd: "ls", cwd: props.data?.repo ?? "/home/n/slopos" },
                { runAs: "user", timeoutMs: 5000 }
              );
              host.logStatus(result.stdout?.split("\n").filter(Boolean).slice(0, 3).join(" | ") || "repo listing finished");
            }}
          >
            List Repo
          </Button>
          <Button
            tone="secondary"
            onClick={async () => {
              const result = await host.tool<{ ptyId?: string }>(
                "pty_open",
                { cwd: props.data?.repo ?? "/home/n/slopos", command: "ls" },
                { runAs: "user" }
              );
              host.logStatus(result.ptyId ? `Opened PTY ${result.ptyId.slice(0, 8)}` : "Opened PTY session");
            }}
          >
            Open PTY
          </Button>
        </Row>
        <Text tone="muted">Repo hint: {props.data?.repo ?? "current working directory"}</Text>
      </Column>
    </Card>
  );
}
