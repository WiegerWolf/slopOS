import { mkdir } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { CONTRACT_VERSIONS, type Task, type TurnPart } from "@slopos/runtime";
import { getTerminalSnapshot, handleToolCall, type EventState } from "./tools";
import { planIntentWithCloud, type PlannerContext } from "./llm";
import { appendBrowserEvent, drainBrowserCommands, getBrowserEvents, subscribeBrowserCommands, subscribeBrowserEvents, syncBrowserSessions, type BrowserSessionSnapshot } from "./browser-session-store";
import { getSloposSessionEvents, subscribeSloposSessionEvents, syncSloposSession, type SloposSessionSnapshot } from "./slopos-session-store";
import { getHistoryFilePath, initializeHistory } from "./session/history";
import { beginTurn } from "./session/loop";
import { getTurn, resolveTurnConfirmation, subscribeTurn } from "./session/store";
import { pollBluetoothState } from "./adapter/bluetooth";
import { pollAudioState } from "./adapter/audio";
import { pollNetworkState } from "./adapter/network";
import { diffEventState, onStateChange, type StateChangeEvent } from "./adapter/state-diff";
import { isPanicActive, exitPanicMode } from "./session/panic";
import { loadConfig, saveConfig, listProviders, type SlopConfig } from "./config";

const workspaceRoot = "/home/n/slopos";
const generatedRuntimeRoot = join(workspaceRoot, "apps/shell/src/generated-runtime");

const eventState: EventState = {
  "bluetooth.devices": {
    scanning: false,
    devices: []
  },
  "audio.state": {
    sinks: [],
    sources: []
  },
  "network.state": {
    connections: [],
    wifi: []
  },
  "system.panic": undefined
};

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
}

function versioned<T extends Record<string, unknown>>(data: T) {
  return {
    protocolVersion: CONTRACT_VERSIONS.bridgeProtocol,
    ...data
  };
}

function protocolMismatch(receivedProtocolVersion?: number) {
  return json(versioned({
    ok: false,
    error: "protocol mismatch",
    expectedProtocolVersion: CONTRACT_VERSIONS.bridgeProtocol,
    receivedProtocolVersion
  }), { status: 409 });
}

function validateProtocolVersion(receivedProtocolVersion?: number) {
  if (receivedProtocolVersion == null) {
    return null;
  }

  if (receivedProtocolVersion !== CONTRACT_VERSIONS.bridgeProtocol) {
    return protocolMismatch(receivedProtocolVersion);
  }

  return null;
}

async function readBody<T>(request: Request) {
  return (await request.json()) as T;
}

function createTask(intent: string): Task {
  const now = Date.now();
  return {
    id: `task-${crypto.randomUUID().slice(0, 8)}`,
    intent,
    createdAt: now,
    updatedAt: now,
    status: "planning",
    source: {
      mode: "text",
      rawInput: intent,
      wakeMethod: "`"
    },
    plan: null,
    artifacts: [],
    chronicleEntryId: null,
    parentTaskId: null,
    priority: "foreground",
    confirmationRequests: [],
    logs: [],
    summary: {
      title: intent,
      oneLine: intent
    }
  };
}

function sse(data: unknown, event?: string) {
  const encoder = new TextEncoder();
  const lines = [];
  if (event) {
    lines.push(`event: ${event}`);
  }
  lines.push(`data: ${JSON.stringify(data)}`);
  return encoder.encode(`${lines.join("\n")}\n\n`);
}

function streamTurn(turnId: string) {
  const turn = getTurn(turnId);
  if (!turn) {
    return json({ ok: false, error: `unknown turn ${turnId}` }, { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(": connected\n\n"));

      for (const part of turn.parts) {
        controller.enqueue(sse(versioned({ part }), "part"));
      }

      if (turn.closed) {
        controller.close();
        return;
      }

      unsubscribe = subscribeTurn(turnId, (part) => {
        controller.enqueue(sse(versioned({ part }), "part"));
        if (part.kind === "turn_complete" || part.kind === "turn_error") {
          unsubscribe?.();
          controller.close();
        }
      });
    },
    cancel() {
      unsubscribe?.();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    }
  });
}

function streamBrowserCommands(sessionKey: string, artifactId: string) {
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(": connected\n\n"));

      for (const command of drainBrowserCommands(sessionKey, artifactId)) {
        controller.enqueue(sse(versioned({ command }), "command"));
      }

      unsubscribe = subscribeBrowserCommands(sessionKey, artifactId, (command) => {
        controller.enqueue(sse(versioned({ command }), "command"));
      });
    },
    cancel() {
      unsubscribe?.();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    }
  });
}

function streamBrowserEvents(sessionKey: string) {
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(": connected\n\n"));

      for (const event of getBrowserEvents(sessionKey, 20).slice().reverse()) {
        controller.enqueue(sse(versioned({ event }), "browser-event"));
      }

      unsubscribe = subscribeBrowserEvents(sessionKey, (event) => {
        controller.enqueue(sse(versioned({ event }), "browser-event"));
      });
    },
    cancel() {
      unsubscribe?.();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    }
  });
}

function streamSloposSessionEvents(sessionKey: string) {
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(": connected\n\n"));

      for (const event of getSloposSessionEvents(sessionKey, 20).slice().reverse()) {
        controller.enqueue(sse(versioned({ event }), "session-event"));
      }

      unsubscribe = subscribeSloposSessionEvents(sessionKey, (event) => {
        controller.enqueue(sse(versioned({ event }), "session-event"));
      });
    },
    cancel() {
      unsubscribe?.();
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    }
  });
}

async function writeSurfaceModule(body: {
  protocolVersion?: number;
  moduleId: string;
  path: string;
  code: string;
}) {
  const mismatch = validateProtocolVersion(body.protocolVersion);
  if (mismatch) {
    return mismatch;
  }

  const targetPath = normalize(join(workspaceRoot, body.path));

  if (!targetPath.startsWith(generatedRuntimeRoot)) {
    return json(versioned({ ok: false, error: "surface path must stay inside generated-runtime" }), { status: 400 });
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, body.code, "utf8");

  return json(versioned({
    ok: true,
    moduleId: body.moduleId,
    path: body.path
  }));
}

await mkdir(generatedRuntimeRoot, { recursive: true });
await initializeHistory();

// Start adapter polling
pollBluetoothState(eventState, 5000);
pollAudioState(eventState, 3000);
pollNetworkState(eventState, 5000);

// State change diffing — run every 2s, after adapters have polled
setInterval(() => diffEventState(eventState), 2000);

console.log("slopOS adapter polling started (bluetooth, audio, network)");

Bun.serve({
  port: 8787,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json(versioned({ ok: true }));
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      const mismatch = validateProtocolVersion(Number(url.searchParams.get("protocolVersion")) || undefined);
      if (mismatch) {
        return mismatch;
      }
      return json(versioned({ events: eventState }));
    }

    if (request.method === "POST" && url.pathname === "/api/browser/sync") {
      const body = await readBody<{ protocolVersion?: number; sessionKey: string; sessions: BrowserSessionSnapshot[] }>(request);
      const mismatch = validateProtocolVersion(body.protocolVersion);
      if (mismatch) {
        return mismatch;
      }
      syncBrowserSessions(body.sessionKey, Array.isArray(body.sessions) ? body.sessions : []);
      return json(versioned({ ok: true }));
    }

    if (request.method === "POST" && url.pathname === "/api/browser/events") {
      const body = await readBody<{
        protocolVersion?: number;
        sessionKey: string;
        event: {
          artifactId: string;
          eventType: "page_state";
          title?: string;
          url?: string;
          previewText?: string;
          captureState?: "available" | "unavailable";
        };
      }>(request);
      const mismatch = validateProtocolVersion(body.protocolVersion);
      if (mismatch) {
        return mismatch;
      }
      appendBrowserEvent(body.sessionKey, body.event);
      return json(versioned({ ok: true }));
    }

    if (request.method === "GET" && url.pathname === "/api/browser/stream") {
      const mismatch = validateProtocolVersion(Number(url.searchParams.get("protocolVersion")) || undefined);
      if (mismatch) {
        return mismatch;
      }

      const sessionKey = url.searchParams.get("sessionKey") ?? "desktop-main";
      const artifactId = url.searchParams.get("artifactId") ?? "";
      if (!artifactId) {
        return json(versioned({ ok: false, error: "artifactId is required" }), { status: 400 });
      }

      return streamBrowserCommands(sessionKey, artifactId);
    }

    if (request.method === "GET" && url.pathname === "/api/browser/events/stream") {
      const mismatch = validateProtocolVersion(Number(url.searchParams.get("protocolVersion")) || undefined);
      if (mismatch) {
        return mismatch;
      }

      const sessionKey = url.searchParams.get("sessionKey") ?? "desktop-main";
      return streamBrowserEvents(sessionKey);
    }

    if (request.method === "POST" && url.pathname === "/api/session/sync") {
      const body = await readBody<SloposSessionSnapshot & { protocolVersion?: number }>(request);
      const mismatch = validateProtocolVersion(body.protocolVersion);
      if (mismatch) {
        return mismatch;
      }
      syncSloposSession(body);
      return json(versioned({ ok: true }));
    }

    if (request.method === "GET" && url.pathname === "/api/session/stream") {
      const mismatch = validateProtocolVersion(Number(url.searchParams.get("protocolVersion")) || undefined);
      if (mismatch) {
        return mismatch;
      }

      const sessionKey = url.searchParams.get("sessionKey") ?? "desktop-main";
      return streamSloposSessionEvents(sessionKey);
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/turns/") && url.pathname.endsWith("/stream")) {
      const mismatch = validateProtocolVersion(Number(url.searchParams.get("protocolVersion")) || undefined);
      if (mismatch) {
        return mismatch;
      }
      const turnId = url.pathname.slice("/api/turns/".length, -"/stream".length);
      return streamTurn(turnId);
    }

    if (request.method === "GET" && url.pathname === "/api/pty/stream") {
      const mismatch = validateProtocolVersion(Number(url.searchParams.get("protocolVersion")) || undefined);
      if (mismatch) {
        return mismatch;
      }
      const ptyId = url.searchParams.get("ptyId") ?? "";
      const initial = getTerminalSnapshot(ptyId);

      if (!initial) {
        return json({ ok: false, error: `unknown pty session ${ptyId}` }, { status: 404 });
      }

      let lastPayload = JSON.stringify(initial);

      let timer: ReturnType<typeof setInterval> | undefined;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(sse(initial, "snapshot"));

          timer = setInterval(() => {
            const snapshot = getTerminalSnapshot(ptyId);

            if (!snapshot) {
              controller.enqueue(sse({ ptyId, closed: true }, "closed"));
              clearInterval(timer);
              controller.close();
              return;
            }

            const payload = JSON.stringify(snapshot);
            if (payload !== lastPayload) {
              lastPayload = payload;
              controller.enqueue(sse(snapshot, "snapshot"));
            }

            if (snapshot.closed) {
              clearInterval(timer);
              controller.close();
            }
          }, 200);
        },
        cancel() {
          if (timer) {
            clearInterval(timer);
          }
        }
      });

      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive"
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/api/intent") {
      const body = await readBody<{ intent: string; context?: PlannerContext }>(request);
      const task = createTask(body.intent);
      const { response, source } = await planIntentWithCloud(task, body.context);
      return json(versioned({ task, response, plannerSource: source }));
    }

    if (request.method === "POST" && url.pathname === "/api/turns") {
      const body = await readBody<{ protocolVersion?: number; intent: string; context?: PlannerContext; sessionKey?: string }>(request);
      const mismatch = validateProtocolVersion(body.protocolVersion);
      if (mismatch) {
        return mismatch;
      }
      if (isPanicActive(eventState)) {
        return json(versioned({ ok: false, error: "system is in panic mode — dismiss panic before starting new turns" }), { status: 503 });
      }
      const task = createTask(body.intent);
      const turn = beginTurn(task, body.context, (input) => handleToolCall(input, eventState), body.sessionKey ?? "default", { eventState });
      return json(versioned({ turnId: turn.id, taskId: task.id }));
    }

    if (request.method === "GET" && url.pathname === "/api/notifications/stream") {
      let unsubscribe: (() => void) | undefined;

      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(": connected\n\n"));
          unsubscribe = onStateChange((event: StateChangeEvent) => {
            controller.enqueue(sse(versioned({ event }), "state-change"));
          });
        },
        cancel() {
          unsubscribe?.();
        }
      });

      return new Response(stream, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive"
        }
      });
    }

    if (request.method === "POST" && url.pathname === "/api/panic/dismiss") {
      exitPanicMode(eventState);
      return json(versioned({ ok: true }));
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/turns/") && url.pathname.endsWith("/confirm")) {
      const turnId = url.pathname.slice("/api/turns/".length, -"/confirm".length);
      const body = await readBody<{ protocolVersion?: number; confirmationId: string; approved: boolean }>(request);
      const mismatch = validateProtocolVersion(body.protocolVersion);
      if (mismatch) {
        return mismatch;
      }
      const resolved = resolveTurnConfirmation(turnId, body.confirmationId, body.approved);
      return json(versioned({ ok: resolved }));
    }

    if (request.method === "POST" && url.pathname === "/api/tools") {
      const body = await readBody<{ name: string; args?: Record<string, unknown>; options?: Record<string, unknown> }>(request);
      const mismatch = validateProtocolVersion(Number((body as { protocolVersion?: number }).protocolVersion) || undefined);
      if (mismatch) {
        return mismatch;
      }
      return json(versioned(await handleToolCall(body, eventState)));
    }

    if (request.method === "GET" && url.pathname === "/api/config") {
      const config = await loadConfig();
      // Mask saved keys for the response
      const maskedKeys: Record<string, string> = {};
      for (const [id, key] of Object.entries(config.keys)) {
        maskedKeys[id] = key.length > 8
          ? `${key.slice(0, 4)}...${key.slice(-4)}`
          : "****";
      }
      return json(versioned({
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl,
        plannerMode: config.plannerMode,
        keys: maskedKeys,
        providers: listProviders(config),
      }));
    }

    if (request.method === "POST" && url.pathname === "/api/config") {
      const body = await readBody<Partial<SlopConfig> & { protocolVersion?: number }>(request);
      const mismatch = validateProtocolVersion(body.protocolVersion);
      if (mismatch) {
        return mismatch;
      }

      const current = await loadConfig();

      if (body.provider !== undefined) current.provider = body.provider;
      if (body.model !== undefined) current.model = body.model;
      if (body.baseUrl !== undefined) current.baseUrl = body.baseUrl;
      if (body.plannerMode) current.plannerMode = body.plannerMode;
      if (body.customProviders) current.customProviders = body.customProviders;

      // Merge keys (don't replace the whole map)
      if (body.keys) {
        for (const [id, key] of Object.entries(body.keys)) {
          if (key) {
            current.keys[id] = key;
          } else {
            delete current.keys[id];
          }
        }
      }

      await saveConfig(current);
      return json(versioned({ ok: true }));
    }

    if (request.method === "POST" && url.pathname === "/api/surfaces/write") {
      const body = await readBody<{ moduleId: string; path: string; code: string }>(request);
      return writeSurfaceModule(body);
    }

    return json({ ok: false, error: "not found" }, { status: 404 });
  }
});

console.log("slopOS bridge listening on http://127.0.0.1:8787");
console.log(`slopOS bridge history file ${getHistoryFilePath()}`);
