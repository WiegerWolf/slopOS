import React from "react";
import { useArtifactState, useHost, type SurfaceProps } from "@slopos/host";
import { Button, FactGrid, Row, SectionList } from "@slopos/ui";
import { CoreSurfaceFrame, CoreSurfaceHint } from "../core-surface-frame";
import { connectVersionedEventStream } from "../event-stream";

type BrowserSnapshot = {
  sessionKey: string;
  recentEvents?: Array<{
    id?: string;
    artifactId?: string;
    eventType?: "page_state";
    title?: string;
    url?: string;
    previewText?: string;
    captureState?: "available" | "unavailable";
    timestamp?: number;
  }>;
  sessions: Array<{
    artifactId?: string;
    title?: string;
    activeUrl?: string;
    tabCount?: number;
    sessionSummary?: string;
    activeTab?: {
      id?: string;
      title?: string;
      url?: string;
      previewText?: string;
      captureState?: "available" | "unavailable";
    };
    tabs?: Array<{
      id?: string;
      title?: string;
      url?: string;
      previewText?: string;
      captureState?: "available" | "unavailable";
    }>;
  }>;
};

export const surface = {
  id: "browser-inspector",
  title: "Browser Session Inspector",
  version: "0.1.0",
  preferredPlacement: "center",
  defaultRetention: "pinned"
} as const;

function buildFacts(snapshot: BrowserSnapshot | null) {
  const sessions = snapshot?.sessions ?? [];
  const primary = sessions[0];
  return [
    { label: "Browser workspaces", value: String(sessions.length) },
    { label: "Focused workspace", value: primary?.title ?? "None" },
    { label: "Focused tabs", value: String(primary?.tabCount ?? 0) },
    { label: "Current URL", value: primary?.activeUrl ?? "No active browser pane" }
  ];
}

function buildSections(snapshot: BrowserSnapshot | null) {
  const sessions = snapshot?.sessions ?? [];
  const primary = sessions[0];

  return [
    {
      title: "Browser workspaces",
      lines: sessions.slice(0, 6).map((session) => `${session.title ?? "Untitled"} - ${session.activeUrl ?? "unknown"} (${session.tabCount ?? 0} tabs)`)
    },
    {
      title: "Focused page preview",
      lines: primary?.activeTab?.previewText
        ? [primary.activeTab.previewText]
        : primary?.activeTab
          ? [`Preview unavailable for ${primary.activeTab.url ?? primary.activeUrl ?? "current page"}`]
          : []
    },
    {
      title: "Focused tabs",
      lines: (primary?.tabs ?? []).slice(0, 8).map((tab) => `${tab.title ?? tab.url ?? "Untitled"} - ${tab.url ?? "unknown"}`)
    },
    {
      title: "Recent browser events",
      lines: (snapshot?.recentEvents ?? []).slice(0, 6).map((event) => `${event.title ?? event.url ?? "Untitled"} - ${event.captureState ?? "unknown"}${event.previewText ? ` - ${event.previewText}` : ""}`)
    }
  ].filter((section) => section.lines.length > 0);
}

export default function BrowserInspector(
  props: SurfaceProps<{ sessionKey?: string; initialSnapshot?: BrowserSnapshot; restoredFromPersistence?: boolean; restoreStrategy?: string }>
) {
  const host = useHost();
  const sessionKey = props.data?.sessionKey ?? "desktop-main";
  const [snapshot, setSnapshot] = useArtifactState<BrowserSnapshot | null>(props.data?.initialSnapshot ?? null);
  const [refreshing, setRefreshing] = useArtifactState(false);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const [result, recentEvents] = await Promise.all([
        host.tool<BrowserSnapshot>(
          "browser_session_snapshot",
          { sessionKey },
          { runAs: "user" }
        ),
        host.tool<{ sessionKey: string; events: BrowserSnapshot["recentEvents"] }>(
          "browser_recent_events",
          { sessionKey, limit: 8 },
          { runAs: "user" }
        )
      ]);

      const merged: BrowserSnapshot = {
        ...result,
        recentEvents: recentEvents.events ?? []
      };

      setSnapshot(merged);
      host.updateArtifact({
        data: {
          sessionKey,
          initialSnapshot: merged
        }
      });
      host.logStatus(`Refreshed browser snapshot for ${sessionKey}`);
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
    const close = connectVersionedEventStream<{ event?: NonNullable<BrowserSnapshot["recentEvents"]>[number] }>({
      path: `/api/browser/events/stream?sessionKey=${encodeURIComponent(sessionKey)}`,
      event: "browser-event",
      onMessage: (payload) => {
        const nextEvent = payload.event;
        if (!nextEvent) {
          return;
        }

        setSnapshot((current) => {
          if (!current) {
            return current;
          }

          const nextEvents = [nextEvent, ...(current.recentEvents ?? []).filter((item) => item.id !== nextEvent.id)].slice(0, 12);
          const nextSessions = current.sessions.map((session) =>
            session.artifactId === nextEvent.artifactId
              ? {
                  ...session,
                  activeTab: session.activeTab
                    ? {
                        ...session.activeTab,
                        title: nextEvent.title ?? session.activeTab.title,
                        url: nextEvent.url ?? session.activeTab.url,
                        previewText: nextEvent.previewText ?? session.activeTab.previewText,
                        captureState: nextEvent.captureState ?? session.activeTab.captureState
                      }
                    : session.activeTab,
                  activeUrl: nextEvent.url ?? session.activeUrl
                }
              : session
          );

          return {
            ...current,
            recentEvents: nextEvents,
            sessions: nextSessions
          };
        });
      }
    });

    return close;
  }, [sessionKey, setSnapshot]);

  return (
    <CoreSurfaceFrame
      surfaceId="browser-inspector"
      restored={props.data?.restoredFromPersistence}
      restoreStrategy={props.data?.restoreStrategy}
    >
      <CoreSurfaceHint>
        Keep this pinned if you want a live view of what browser workspaces slopOS currently knows about.
      </CoreSurfaceHint>
      <Row gap={10}>
        <Button onClick={() => void refresh()}>{refreshing ? "Refreshing..." : "Refresh"}</Button>
        <Button tone="secondary" onClick={() => host.logStatus(snapshot?.sessions?.[0]?.sessionSummary ?? "No browser summary available")}>Echo Focused Summary</Button>
      </Row>
      <FactGrid items={buildFacts(snapshot)} />
      <SectionList sections={buildSections(snapshot)} />
    </CoreSurfaceFrame>
  );
}
