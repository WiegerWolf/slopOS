import { useEffect, useCallback, useState } from "react";
import { CONTRACT_VERSIONS } from "@slopos/runtime";

export type Notification = {
  id: string;
  summary: string;
  kind: string;
  key: string;
  timestamp: number;
};

const BRIDGE = "/api";
const AUTO_DISMISS_MS = 6000;

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    let evtSource: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const url = `${BRIDGE}/notifications/stream?protocolVersion=${CONTRACT_VERSIONS.bridgeProtocol}`;
      evtSource = new EventSource(url);

      evtSource.addEventListener("state-change", (evt) => {
        try {
          const envelope = JSON.parse(evt.data) as { event?: { summary?: string; kind?: string; key?: string; timestamp?: number } };
          const event = envelope.event;
          if (!event?.summary) return;

          const notification: Notification = {
            id: crypto.randomUUID(),
            summary: event.summary,
            kind: event.kind ?? "changed",
            key: event.key ?? "system",
            timestamp: event.timestamp ?? Date.now()
          };

          setNotifications((prev) => [...prev, notification]);

          // Auto-dismiss
          setTimeout(() => {
            setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
          }, AUTO_DISMISS_MS);
        } catch {
          // ignore parse errors
        }
      });

      evtSource.onerror = () => {
        evtSource?.close();
        retryTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      evtSource?.close();
      clearTimeout(retryTimer);
    };
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, dismiss };
}
