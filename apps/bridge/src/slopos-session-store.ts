export type SloposSessionSnapshot = {
  sessionKey: string;
  statusText?: string;
  artifacts: Array<{
    id: string;
    title: string;
    type: string;
    retention: string;
    moduleId?: string;
    sessionSummary?: string;
    currentUrl?: string;
  }>;
  chronicle: Array<{
    id: string;
    title: string;
    oneLine: string;
    status: string;
  }>;
  confirmations: Array<{
    id: string;
    title: string;
    status: string;
    source: string;
  }>;
  updatedAt: number;
};

export type SloposSessionEvent = {
  id: string;
  sessionKey: string;
  eventType: "session_snapshot";
  snapshot: SloposSessionSnapshot;
  timestamp: number;
};

const sloposSessions = new Map<string, SloposSessionSnapshot>();
const sloposSessionEvents = new Map<string, SloposSessionEvent[]>();
const sloposSessionSubscribers = new Map<string, Set<(event: SloposSessionEvent) => void>>();

export function syncSloposSession(snapshot: SloposSessionSnapshot) {
  sloposSessions.set(snapshot.sessionKey, snapshot);

  const event: SloposSessionEvent = {
    id: crypto.randomUUID(),
    sessionKey: snapshot.sessionKey,
    eventType: "session_snapshot",
    snapshot,
    timestamp: Date.now()
  };

  const current = sloposSessionEvents.get(snapshot.sessionKey) ?? [];
  current.push(event);
  sloposSessionEvents.set(snapshot.sessionKey, current.slice(-80));

  const subscribers = sloposSessionSubscribers.get(snapshot.sessionKey);
  if (subscribers) {
    for (const subscriber of subscribers) {
      subscriber(event);
    }
  }
}

export function getSloposSession(sessionKey: string) {
  return sloposSessions.get(sessionKey);
}

export function listSloposSessions() {
  return Array.from(sloposSessions.values());
}

export function getSloposSessionEvents(sessionKey: string, limit = 20) {
  return (sloposSessionEvents.get(sessionKey) ?? []).slice(-limit).reverse();
}

export function subscribeSloposSessionEvents(sessionKey: string, onEvent: (event: SloposSessionEvent) => void) {
  let subscribers = sloposSessionSubscribers.get(sessionKey);
  if (!subscribers) {
    subscribers = new Set();
    sloposSessionSubscribers.set(sessionKey, subscribers);
  }

  subscribers.add(onEvent);
  return () => {
    subscribers?.delete(onEvent);
    if (subscribers && subscribers.size === 0) {
      sloposSessionSubscribers.delete(sessionKey);
    }
  };
}
