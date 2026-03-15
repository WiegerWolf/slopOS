import React from "react";
import { useArtifactState, useHost, type SurfaceProps } from "@slopos/host";
import { Button, FactGrid, Row, SectionList } from "@slopos/ui";
import { CoreSurfaceFrame, CoreSurfaceHint } from "../core-surface-frame";
import { connectVersionedEventStream } from "../event-stream";

type DiagnosticsSnapshot = {
  versions?: Record<string, number>;
  history?: {
    filePath?: string;
    sessionCount?: number;
    recordsBySession?: Array<{
      sessionKey?: string;
      recordCount?: number;
    }>;
  };
  turns?: {
    totalTurns?: number;
    activeTurns?: number;
    closedTurns?: number;
    pendingConfirmations?: number;
    recentTurns?: Array<{
      intent?: string;
      closed?: boolean;
      partCount?: number;
    }>;
  };
  sessions?: {
    requestedSession?: string | null;
    sessionCount?: number;
    currentSession?: {
      statusText?: string;
    } | null;
  };
  registry?: {
    tools?: Array<{
      id?: string;
      safety?: string;
      mayRequireConfirmation?: boolean;
    }>;
    surfaces?: Array<{
      id?: string;
      refreshTool?: string | null;
      capabilities?: string[];
    }>;
  };
};

export const surface = {
  id: "diagnostics-inspector",
  title: "slopOS Diagnostics",
  version: "0.1.0",
  preferredPlacement: "center",
  defaultRetention: "pinned"
} as const;

function buildFacts(snapshot: DiagnosticsSnapshot | null) {
  return [
    { label: "Protocol", value: String(snapshot?.versions?.protocol ?? "?") },
    { label: "Bridge history", value: String(snapshot?.versions?.bridgeHistory ?? "?") },
    { label: "Shell state", value: String(snapshot?.versions?.shellState ?? "?") },
    { label: "Active turns", value: String(snapshot?.turns?.activeTurns ?? 0) },
    { label: "Pending confirmations", value: String(snapshot?.turns?.pendingConfirmations ?? 0) },
    { label: "Tracked sessions", value: String(snapshot?.sessions?.sessionCount ?? 0) }
  ];
}

function buildSections(snapshot: DiagnosticsSnapshot | null) {
  return [
    {
      title: "Recent turns",
      lines: (snapshot?.turns?.recentTurns ?? []).slice(0, 6).map((turn) => `${turn.intent ?? "Unknown"} - ${turn.closed ? "closed" : "active"} (${turn.partCount ?? 0} parts)`)
    },
    {
      title: "Tool registry",
      lines: (snapshot?.registry?.tools ?? []).slice(0, 10).map((tool) => `${tool.id ?? "unknown"} - ${tool.safety ?? "unknown"}${tool.mayRequireConfirmation ? " - confirmable" : ""}`)
    },
    {
      title: "Core surfaces",
      lines: (snapshot?.registry?.surfaces ?? []).slice(0, 10).map((surface) => `${surface.id ?? "unknown"}${surface.refreshTool ? ` - refresh: ${surface.refreshTool}` : ""}`)
    },
    {
      title: "History sessions",
      lines: (snapshot?.history?.recordsBySession ?? []).slice(0, 6).map((session) => `${session.sessionKey ?? "unknown"} - ${session.recordCount ?? 0} records`)
    }
  ].filter((section) => section.lines.length > 0);
}

export default function DiagnosticsInspector(
  props: SurfaceProps<{ sessionKey?: string; initialSnapshot?: DiagnosticsSnapshot; restoredFromPersistence?: boolean; restoreStrategy?: string }>
) {
  const host = useHost();
  const sessionKey = props.data?.sessionKey ?? "desktop-main";
  const [snapshot, setSnapshot] = useArtifactState<DiagnosticsSnapshot | null>(props.data?.initialSnapshot ?? null);
  const [refreshing, setRefreshing] = useArtifactState(false);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await host.tool<DiagnosticsSnapshot>(
        "slopos_runtime_diagnostics",
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
      host.logStatus(`Refreshed diagnostics for ${sessionKey}`);
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
    return connectVersionedEventStream<{
      event?: {
        snapshot?: unknown;
      };
    }>({
      path: `/api/session/stream?sessionKey=${encodeURIComponent(sessionKey)}`,
      event: "session-event",
      onMessage: () => {
        void refresh();
      }
    });
  }, [refresh, sessionKey]);

  return (
    <CoreSurfaceFrame
      surfaceId="diagnostics-inspector"
      restored={props.data?.restoredFromPersistence}
      restoreStrategy={props.data?.restoreStrategy}
    >
      <CoreSurfaceHint>
        Use this surface to inspect bridge health, protocol versions, turn activity, and registered slopOS capabilities.
      </CoreSurfaceHint>
      <Row gap={10}>
        <Button onClick={() => void refresh()}>{refreshing ? "Refreshing..." : "Refresh"}</Button>
        <Button tone="secondary" onClick={() => host.logStatus(snapshot?.sessions?.currentSession?.statusText ?? "No current session status")}>Echo Session Status</Button>
      </Row>
      <FactGrid items={buildFacts(snapshot)} />
      <SectionList sections={buildSections(snapshot)} />
    </CoreSurfaceFrame>
  );
}
