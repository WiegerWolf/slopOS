export type BrowserSessionSnapshot = {
  artifactId: string;
  title: string;
  activeUrl: string;
  tabCount: number;
  sessionSummary?: string;
  activeTab?: {
    id?: string;
    title?: string;
    url?: string;
    previewText?: string;
    captureState?: "available" | "unavailable";
  };
  tabs?: Array<{
    id: string;
    title: string;
    url: string;
    previewText?: string;
    captureState?: "available" | "unavailable";
  }>;
  updatedAt: number;
};

export type BrowserCommand = {
  id: string;
  type: "open_url" | "focus_tab";
  url?: string;
  tabId?: string;
  newTab?: boolean;
  createdAt: number;
};

export type BrowserEvent = {
  id: string;
  artifactId: string;
  eventType: "page_state";
  title?: string;
  url?: string;
  previewText?: string;
  captureState?: "available" | "unavailable";
  timestamp: number;
};

const browserSessions = new Map<string, BrowserSessionSnapshot[]>();
const browserCommands = new Map<string, Map<string, BrowserCommand[]>>();
const browserCommandSubscribers = new Map<string, Map<string, Set<(command: BrowserCommand) => void>>>();
const browserEvents = new Map<string, BrowserEvent[]>();
const browserEventSubscribers = new Map<string, Set<(event: BrowserEvent) => void>>();

export function syncBrowserSessions(sessionKey: string, sessions: BrowserSessionSnapshot[]) {
  browserSessions.set(sessionKey, sessions);
}

export function getBrowserSessions(sessionKey?: string) {
  if (sessionKey) {
    return browserSessions.get(sessionKey) ?? [];
  }

  return Array.from(browserSessions.values()).flat();
}

export function getFocusedBrowserSession(sessionKey: string) {
  return getBrowserSessions(sessionKey)[0] ?? null;
}

export function getBrowserSessionDetail(sessionKey: string, artifactId?: string) {
  const sessions = getBrowserSessions(sessionKey);
  if (!artifactId) {
    return sessions[0] ?? null;
  }

  return sessions.find((session) => session.artifactId === artifactId) ?? null;
}

function ensureCommandBucket(sessionKey: string, artifactId: string) {
  let sessionCommands = browserCommands.get(sessionKey);
  if (!sessionCommands) {
    sessionCommands = new Map();
    browserCommands.set(sessionKey, sessionCommands);
  }

  let commands = sessionCommands.get(artifactId);
  if (!commands) {
    commands = [];
    sessionCommands.set(artifactId, commands);
  }

  return commands;
}

function getSubscribers(sessionKey: string, artifactId: string) {
  return browserCommandSubscribers.get(sessionKey)?.get(artifactId) ?? null;
}

function resolveArtifactId(sessionKey: string, artifactId?: string) {
  if (artifactId) {
    return artifactId;
  }

  return getFocusedBrowserSession(sessionKey)?.artifactId ?? null;
}

export function enqueueBrowserCommand(
  sessionKey: string,
  command: Omit<BrowserCommand, "id" | "createdAt">,
  artifactId?: string,
) {
  const resolvedArtifactId = resolveArtifactId(sessionKey, artifactId);
  if (!resolvedArtifactId) {
    return null;
  }

  const fullCommand: BrowserCommand = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...command
  };

  const subscribers = getSubscribers(sessionKey, resolvedArtifactId);
  if (subscribers && subscribers.size > 0) {
    for (const subscriber of subscribers) {
      subscriber(fullCommand);
    }
  } else {
    const bucket = ensureCommandBucket(sessionKey, resolvedArtifactId);
    bucket.push(fullCommand);
  }

  return {
    artifactId: resolvedArtifactId,
    command: fullCommand
  };
}

export function drainBrowserCommands(sessionKey: string, artifactId: string) {
  const sessionCommands = browserCommands.get(sessionKey);
  if (!sessionCommands) {
    return [];
  }

  const commands = sessionCommands.get(artifactId) ?? [];
  sessionCommands.set(artifactId, []);
  return commands;
}

export function claimBrowserCommands(sessionKey: string, artifactId: string) {
  return drainBrowserCommands(sessionKey, artifactId);
}

export function appendBrowserEvent(sessionKey: string, event: Omit<BrowserEvent, "id" | "timestamp"> & { id?: string; timestamp?: number }) {
  const fullEvent: BrowserEvent = {
    id: event.id ?? crypto.randomUUID(),
    timestamp: event.timestamp ?? Date.now(),
    ...event
  };

  const current = browserEvents.get(sessionKey) ?? [];
  current.push(fullEvent);
  browserEvents.set(sessionKey, current.slice(-80));

  const subscribers = browserEventSubscribers.get(sessionKey);
  if (subscribers) {
    for (const subscriber of subscribers) {
      subscriber(fullEvent);
    }
  }

  return fullEvent;
}

export function getBrowserEvents(sessionKey: string, limit = 20) {
  return (browserEvents.get(sessionKey) ?? []).slice(-limit).reverse();
}

export function subscribeBrowserEvents(sessionKey: string, onEvent: (event: BrowserEvent) => void) {
  let subscribers = browserEventSubscribers.get(sessionKey);
  if (!subscribers) {
    subscribers = new Set();
    browserEventSubscribers.set(sessionKey, subscribers);
  }

  subscribers.add(onEvent);
  return () => {
    subscribers?.delete(onEvent);
    if (subscribers && subscribers.size === 0) {
      browserEventSubscribers.delete(sessionKey);
    }
  };
}

export function subscribeBrowserCommands(
  sessionKey: string,
  artifactId: string,
  onCommand: (command: BrowserCommand) => void,
) {
  let sessionSubscribers = browserCommandSubscribers.get(sessionKey);
  if (!sessionSubscribers) {
    sessionSubscribers = new Map();
    browserCommandSubscribers.set(sessionKey, sessionSubscribers);
  }

  let artifactSubscribers = sessionSubscribers.get(artifactId);
  if (!artifactSubscribers) {
    artifactSubscribers = new Set();
    sessionSubscribers.set(artifactId, artifactSubscribers);
  }

  artifactSubscribers.add(onCommand);
  return () => {
    artifactSubscribers?.delete(onCommand);
    if (artifactSubscribers && artifactSubscribers.size === 0) {
      sessionSubscribers?.delete(artifactId);
    }
    if (sessionSubscribers && sessionSubscribers.size === 0) {
      browserCommandSubscribers.delete(sessionKey);
    }
  };
}
