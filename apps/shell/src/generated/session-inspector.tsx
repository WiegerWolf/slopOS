import React from "react";
import { useArtifactState, useHost, type SurfaceProps } from "@slopos/host";
import { Button, FactGrid, Row, SectionList } from "@slopos/ui";
import { CoreSurfaceFrame, CoreSurfaceHint } from "../core-surface-frame";
import { connectEventStream } from "../event-stream";

type SessionSnapshot = {
  sessionKey: string;
  session: {
    statusText?: string;
    artifacts?: Array<{
      id?: string;
      title?: string;
      type?: string;
      retention?: string;
      moduleId?: string;
      sessionSummary?: string;
      currentUrl?: string;
    }>;
    chronicle?: Array<{
      id?: string;
      title?: string;
      oneLine?: string;
      status?: string;
    }>;
    confirmations?: Array<{
      id?: string;
      title?: string;
      status?: string;
      source?: string;
    }>;
  } | null;
};

export const surface = {
  id: "session-inspector",
  title: "slopOS Session Inspector",
  version: "0.1.0",
  preferredPlacement: "center",
  defaultRetention: "pinned"
} as const;

function buildFacts(snapshot: SessionSnapshot | null) {
  const session = snapshot?.session;
  const artifacts = session?.artifacts ?? [];
  const chronicle = session?.chronicle ?? [];
  const confirmations = session?.confirmations ?? [];

  return [
    { label: "Status text", value: session?.statusText ?? "idle" },
    { label: "Visible artifacts", value: String(artifacts.length) },
    { label: "Chronicle entries", value: String(chronicle.length) },
    { label: "Confirmations", value: String(confirmations.length) }
  ];
}

function buildSections(snapshot: SessionSnapshot | null) {
  const session = snapshot?.session;
  const artifacts = session?.artifacts ?? [];
  const chronicle = session?.chronicle ?? [];
  const confirmations = session?.confirmations ?? [];

  return [
    {
      title: "Visible artifacts",
      lines: artifacts.slice(0, 8).map((artifact) => `${artifact.title ?? "Untitled"} - ${artifact.type ?? "unknown"}${artifact.currentUrl ? ` - ${artifact.currentUrl}` : artifact.sessionSummary ? ` - ${artifact.sessionSummary}` : ""}`)
    },
    {
      title: "Chronicle",
      lines: chronicle.slice(0, 6).map((entry) => `${entry.title ?? "Untitled"} - ${entry.oneLine ?? entry.status ?? ""}`)
    },
    {
      title: "Confirmations",
      lines: confirmations.slice(0, 6).map((entry) => `${entry.title ?? "Confirmation"} - ${entry.status ?? "unknown"} (${entry.source ?? "unknown"})`)
    }
  ].filter((section) => section.lines.length > 0);
}

export default function SessionInspector(
  props: SurfaceProps<{ sessionKey?: string; initialSnapshot?: SessionSnapshot; restoredFromPersistence?: boolean; restoreStrategy?: string }>
) {
  const host = useHost();
  const sessionKey = props.data?.sessionKey ?? "desktop-main";
  const [snapshot, setSnapshot] = useArtifactState<SessionSnapshot | null>(props.data?.initialSnapshot ?? null);
  const [refreshing, setRefreshing] = useArtifactState(false);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await host.tool<SessionSnapshot>(
        "slopos_session_snapshot",
        { sessionKey },
        { runAs: "user" }
      );
      setSnapshot(result);
      host.updateArtifact({
        data: {
          sessionKey,
          initialSnapshot: result
        }
      });
      host.logStatus(`Refreshed session snapshot for ${sessionKey}`);
    } finally {
      setRefreshing(false);
    }
  }, [host, sessionKey, setRefreshing, setSnapshot]);

  React.useEffect(() => {
    if (!snapshot) {
      void refresh();
    }
  }, [refresh, snapshot]);

  React.useEffect(() => {
    return connectEventStream<{
      event?: {
        snapshot?: {
          sessionKey: string;
          statusText?: string;
          artifacts?: SessionSnapshot["session"] extends infer S
            ? S extends { artifacts?: infer A } ? A : never
            : never;
          chronicle?: SessionSnapshot["session"] extends infer S
            ? S extends { chronicle?: infer C } ? C : never
            : never;
          confirmations?: SessionSnapshot["session"] extends infer S
            ? S extends { confirmations?: infer K } ? K : never
            : never;
        };
      };
    }>({
      path: `/api/session/stream?sessionKey=${encodeURIComponent(sessionKey)}`,
      event: "session-event",
      onMessage: (payload) => {
        const nextSnapshot = payload.event?.snapshot;
        if (!nextSnapshot) {
          return;
        }

        setSnapshot({
          sessionKey: nextSnapshot.sessionKey,
          session: {
            statusText: nextSnapshot.statusText,
            artifacts: nextSnapshot.artifacts,
            chronicle: nextSnapshot.chronicle,
            confirmations: nextSnapshot.confirmations
          }
        });
      }
    });
  }, [sessionKey, setSnapshot]);

  return (
    <CoreSurfaceFrame
      surfaceId="session-inspector"
      restored={props.data?.restoredFromPersistence}
      restoreStrategy={props.data?.restoreStrategy}
    >
      <CoreSurfaceHint>
        Keep this surface pinned if you want a live view of what slopOS thinks is currently on screen.
      </CoreSurfaceHint>
      <Row gap={10}>
        <Button onClick={() => void refresh()}>{refreshing ? "Refreshing..." : "Refresh"}</Button>
        <Button tone="secondary" onClick={() => host.logStatus(snapshot?.session?.statusText ?? "No status text in session snapshot")}>Echo Status</Button>
      </Row>
      <FactGrid items={buildFacts(snapshot)} />
      <SectionList sections={buildSections(snapshot)} />
    </CoreSurfaceFrame>
  );
}
