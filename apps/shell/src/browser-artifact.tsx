import React from "react";
import { CONTRACT_VERSIONS, type Artifact } from "@slopos/runtime";
import { useHost } from "@slopos/host";
import { Badge, Button, Card, Column, Row, Text } from "@slopos/ui";

type BrowserTab = {
  id: string;
  title: string;
  url: string;
  history: string[];
  historyIndex: number;
  previewText?: string;
  captureState?: "available" | "unavailable";
};

type BrowserState = {
  tabs: BrowserTab[];
  activeTabId: string;
};

type BrowserCommand = {
  id: string;
  type: "open_url" | "focus_tab";
  url?: string;
  tabId?: string;
  newTab?: boolean;
};

function labelFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "https://example.com";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function buildDefaultState(artifact: Artifact): BrowserState {
  const data = (artifact.payload.data ?? {}) as Record<string, unknown>;
  const tabsInput = Array.isArray(data.tabs) ? data.tabs : undefined;
  const tabs = tabsInput?.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const url = typeof (entry as { url?: unknown }).url === "string"
      ? (entry as { url: string }).url
      : undefined;

    if (!url) {
      return [];
    }

    return [{
      id: typeof (entry as { id?: unknown }).id === "string" ? (entry as { id: string }).id : crypto.randomUUID(),
      title: typeof (entry as { title?: unknown }).title === "string" ? (entry as { title: string }).title : labelFromUrl(url),
      url,
      history: Array.isArray((entry as { history?: unknown }).history)
        ? (entry as { history: string[] }).history.filter((item) => typeof item === "string")
        : [url],
      historyIndex: typeof (entry as { historyIndex?: unknown }).historyIndex === "number"
        ? Math.max(0, (entry as { historyIndex: number }).historyIndex)
        : 0,
      previewText: typeof (entry as { previewText?: unknown }).previewText === "string"
        ? (entry as { previewText: string }).previewText
        : undefined,
      captureState: (entry as { captureState?: unknown }).captureState === "available" || (entry as { captureState?: unknown }).captureState === "unavailable"
        ? (entry as { captureState: "available" | "unavailable" }).captureState
        : undefined
    } satisfies BrowserTab];
  }) ?? [];

  if (tabs.length > 0) {
    const activeTabId = typeof data.activeTabId === "string" && tabs.some((tab) => tab.id === data.activeTabId)
      ? data.activeTabId
      : tabs[0].id;
    return { tabs, activeTabId };
  }

  const initialUrl = typeof artifact.payload.url === "string"
    ? artifact.payload.url
    : typeof data.url === "string"
      ? data.url
      : "https://vite.dev/guide/";

  const firstTab = {
    id: crypto.randomUUID(),
    title: labelFromUrl(initialUrl),
    url: initialUrl,
    history: [initialUrl],
    historyIndex: 0,
    captureState: "unavailable"
  } satisfies BrowserTab;

  return {
    tabs: [firstTab],
    activeTabId: firstTab.id
  };
}

function sameState(left: BrowserState, right: BrowserState) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export default function BrowserArtifact(props: { artifact: Artifact }) {
  const host = useHost();
  const [browserState, setBrowserState] = React.useState<BrowserState>(() => buildDefaultState(props.artifact));
  const [address, setAddress] = React.useState("");
  const [reloadNonce, setReloadNonce] = React.useState(0);
  const appliedCommandsRef = React.useRef<Set<string>>(new Set());
  const lastEventSignatureRef = React.useRef<string>("");

  React.useEffect(() => {
    const nextState = buildDefaultState(props.artifact);
    setBrowserState((current) => sameState(current, nextState) ? current : nextState);
  }, [props.artifact]);

  const activeTab = browserState.tabs.find((tab) => tab.id === browserState.activeTabId) ?? browserState.tabs[0];
  const canGoBack = Boolean(activeTab && activeTab.historyIndex > 0);
  const canGoForward = Boolean(activeTab && activeTab.historyIndex < activeTab.history.length - 1);

  React.useEffect(() => {
    setAddress(activeTab?.url ?? "");
  }, [activeTab?.id, activeTab?.url]);

  React.useEffect(() => {
    host.updateArtifact({
      data: {
        tabs: browserState.tabs,
        activeTabId: browserState.activeTabId,
        url: activeTab?.url ?? "",
        title: props.artifact.title,
        tabCount: browserState.tabs.length,
        sessionSummary: activeTab ? `${activeTab.title} - ${activeTab.url}` : props.artifact.title,
        activeTab: activeTab
          ? {
              id: activeTab.id,
              title: activeTab.title,
              url: activeTab.url,
              previewText: activeTab.previewText,
              captureState: activeTab.captureState ?? "unavailable"
            }
          : undefined
      }
    });
  }, [activeTab, browserState, host, props.artifact.title]);

  const navigateTo = React.useCallback((rawUrl: string) => {
    const nextUrl = normalizeUrl(rawUrl);

    setBrowserState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === current.activeTabId
          ? {
              ...tab,
              url: nextUrl,
              title: labelFromUrl(nextUrl),
              history: [...tab.history.slice(0, tab.historyIndex + 1), nextUrl],
              historyIndex: tab.historyIndex + 1,
              previewText: undefined,
              captureState: "unavailable"
            }
          : tab
      )
    }));
    setAddress(nextUrl);
  }, []);

  const openNewTab = React.useCallback((rawUrl?: string) => {
    const nextUrl = normalizeUrl(rawUrl ?? activeTab?.url ?? "https://vite.dev/guide/");
    const tab = {
      id: crypto.randomUUID(),
      title: labelFromUrl(nextUrl),
      url: nextUrl,
      history: [nextUrl],
      historyIndex: 0,
      captureState: "unavailable"
    } satisfies BrowserTab;

    setBrowserState((current) => ({
      tabs: [...current.tabs, tab],
      activeTabId: tab.id
    }));
  }, [activeTab?.url]);

  const focusTab = React.useCallback((tabId: string) => {
    setBrowserState((current) =>
      current.tabs.some((tab) => tab.id === tabId)
        ? { ...current, activeTabId: tabId }
        : current,
    );
  }, []);

  const moveHistory = React.useCallback((direction: -1 | 1) => {
    setBrowserState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => {
        if (tab.id !== current.activeTabId) {
          return tab;
        }

        const nextIndex = Math.max(0, Math.min(tab.history.length - 1, tab.historyIndex + direction));
        return {
          ...tab,
          historyIndex: nextIndex,
          url: tab.history[nextIndex] ?? tab.url,
          title: labelFromUrl(tab.history[nextIndex] ?? tab.url)
        };
      })
    }));
  }, []);

  const syncTitleFromFrame = React.useCallback((event: React.SyntheticEvent<HTMLIFrameElement>) => {
    const frame = event.currentTarget;
    try {
      const title = frame.contentDocument?.title?.trim();
      const previewText = frame.contentDocument?.body?.innerText
        ?.replace(/\s+/g, " ")
        .trim()
        .slice(0, 280);

      setBrowserState((current) => ({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === current.activeTabId
            ? {
                ...tab,
                title: title || tab.title,
                previewText: previewText || tab.previewText,
                captureState: previewText ? "available" : "unavailable"
              }
            : tab
        )
      }));
    } catch {
      setBrowserState((current) => ({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === current.activeTabId
            ? { ...tab, captureState: "unavailable" }
            : tab
        )
      }));
    }
  }, []);

  const closeTab = React.useCallback((tabId: string) => {
    setBrowserState((current) => {
      if (current.tabs.length === 1) {
        return current;
      }

      const nextTabs = current.tabs.filter((tab) => tab.id !== tabId);
      const activeTabId = current.activeTabId === tabId ? nextTabs[Math.max(0, nextTabs.length - 1)].id : current.activeTabId;
      return {
        tabs: nextTabs,
        activeTabId
      };
    });
  }, []);

  const restored = Boolean((props.artifact.payload.data as Record<string, unknown> | undefined)?.restoredFromPersistence ?? props.artifact.payload.restoredFromPersistence);
  const restoreStrategy = typeof (props.artifact.payload.data as Record<string, unknown> | undefined)?.restoreStrategy === "string"
    ? (props.artifact.payload.data as Record<string, unknown>).restoreStrategy as string
    : typeof props.artifact.payload.restoreStrategy === "string"
      ? props.artifact.payload.restoreStrategy as string
      : undefined;
  const sessionKey = typeof (props.artifact.payload.data as Record<string, unknown> | undefined)?.sessionKey === "string"
    ? (props.artifact.payload.data as Record<string, unknown>).sessionKey as string
    : "desktop-main";

  React.useEffect(() => {
    if (!activeTab) {
      return;
    }

    const signature = JSON.stringify({
      id: activeTab.id,
      title: activeTab.title,
      url: activeTab.url,
      previewText: activeTab.previewText,
      captureState: activeTab.captureState
    });

    if (signature === lastEventSignatureRef.current) {
      return;
    }

    lastEventSignatureRef.current = signature;

    void fetch("/api/browser/events", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        protocolVersion: CONTRACT_VERSIONS.bridgeProtocol,
        sessionKey,
        event: {
          artifactId: props.artifact.id,
          eventType: "page_state",
          title: activeTab.title,
          url: activeTab.url,
          previewText: activeTab.previewText,
          captureState: activeTab.captureState ?? "unavailable"
        }
      })
    }).catch(() => undefined);
  }, [activeTab, props.artifact.id, sessionKey]);

  React.useEffect(() => {
    const source = new EventSource(
      `/api/browser/stream?protocolVersion=${CONTRACT_VERSIONS.bridgeProtocol}&sessionKey=${encodeURIComponent(sessionKey)}&artifactId=${encodeURIComponent(props.artifact.id)}`,
    );

    const applyCommand = (command: BrowserCommand) => {
      if (!command.id || appliedCommandsRef.current.has(command.id)) {
        return;
      }

      appliedCommandsRef.current.add(command.id);

      if (command.type === "open_url" && command.url) {
        if (command.newTab) {
          openNewTab(command.url);
        } else {
          navigateTo(command.url);
        }
      }

      if (command.type === "focus_tab" && command.tabId) {
        focusTab(command.tabId);
      }
    };

    const handleCommand = (event: MessageEvent<string>) => {
      const payload = JSON.parse(event.data) as { protocolVersion?: number; command?: BrowserCommand };
      if ((payload.protocolVersion ?? CONTRACT_VERSIONS.bridgeProtocol) > CONTRACT_VERSIONS.bridgeProtocol) {
        source.close();
        host.logStatus("Browser control stream protocol mismatch");
        return;
      }
      if (payload.command) {
        applyCommand(payload.command);
      }
    };

    source.addEventListener("command", handleCommand as EventListener);
    source.onerror = () => {
      source.close();
    };

    return () => {
      source.removeEventListener("command", handleCommand as EventListener);
      source.close();
    };
  }, [focusTab, host, navigateTo, openNewTab, props.artifact.id, sessionKey]);

  return (
    <Card title={props.artifact.title} subtitle="Embedded browser workspace">
      <Column gap={14}>
        <Row gap={10}>
          <Badge tone="accent">browser pane</Badge>
          <Badge tone="muted">{browserState.tabs.length} tab{browserState.tabs.length === 1 ? "" : "s"}</Badge>
          {restored ? <Badge tone="muted">restored</Badge> : null}
          {restoreStrategy ? <Badge tone="muted">{restoreStrategy}</Badge> : null}
        </Row>

        <div className="browser-tabs">
          {browserState.tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`browser-tab ${tab.id === browserState.activeTabId ? "active" : ""}`}
              onClick={() => setBrowserState((current) => ({ ...current, activeTabId: tab.id }))}
            >
              <span>{tab.title}</span>
              {browserState.tabs.length > 1 ? (
                <span
                  className="browser-tab-close"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  x
                </span>
              ) : null}
            </button>
          ))}
          <button type="button" className="browser-tab browser-tab-add" onClick={() => openNewTab()}>
            +
          </button>
        </div>

        <Row gap={10} className="browser-controls">
          <Button tone="secondary" onClick={() => moveHistory(-1)}>{canGoBack ? "<" : "<"}</Button>
          <Button tone="secondary" onClick={() => moveHistory(1)}>{canGoForward ? ">" : ">"}</Button>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                navigateTo(address);
              }
            }}
            className="browser-address"
            placeholder="https://vite.dev/guide/"
          />
          <Button onClick={() => navigateTo(address)}>Go</Button>
          <Button tone="secondary" onClick={() => setReloadNonce((value) => value + 1)}>Reload</Button>
          <Button tone="secondary" onClick={() => void host.tool("browser_open", { url: activeTab?.url ?? address }, { runAs: "user" })}>
            External
          </Button>
        </Row>

        <div className="browser-frame-wrap">
          <iframe
            key={`${activeTab?.id ?? "empty"}-${reloadNonce}`}
            className="browser-frame"
            src={activeTab?.url ?? "about:blank"}
            title={activeTab?.title ?? props.artifact.title}
            loading="eager"
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={syncTitleFromFrame}
          />
        </div>

        <Text tone="muted">
          Embedded pages track navigation initiated from this browser chrome. Sites that block framing can still be opened externally.
        </Text>
      </Column>
    </Card>
  );
}
