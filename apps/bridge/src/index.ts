import { mkdir } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import type { Task, TurnPart } from "@slopos/runtime";
import { getTerminalSnapshot, handleToolCall, type EventState } from "./tools";
import type { PlannerContext } from "./llm";
import { getSloposSessionEvents, subscribeSloposSessionEvents, syncSloposSession, type SloposSessionSnapshot } from "./slopos-session-store";
import { initDb } from "./db";
import { beginTurn } from "./session/loop";
import { getTurn, resolveTurnConfirmation, subscribeTurn } from "./session/store";
import { isPanicActive, exitPanicMode } from "./session/panic";
import { loadConfig, saveConfig, listProviders, type SlopConfig } from "./config";
import { setWatchCallback } from "./tool/watch";

const workspaceRoot = "/home/n/slopos";
const generatedRuntimeRoot = join(workspaceRoot, "apps/shell/generated");

const eventState: EventState = {
  "system.panic": undefined,
  "system.theme": undefined
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
        controller.enqueue(sse({ part }, "part"));
      }

      if (turn.closed) {
        controller.close();
        return;
      }

      unsubscribe = subscribeTurn(turnId, (part) => {
        controller.enqueue(sse({ part }, "part"));
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

function streamSloposSessionEvents(sessionKey: string) {
  let unsubscribe: (() => void) | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(": connected\n\n"));

      for (const event of getSloposSessionEvents(sessionKey, 20).slice().reverse()) {
        controller.enqueue(sse({ event }, "session-event"));
      }

      unsubscribe = subscribeSloposSessionEvents(sessionKey, (event) => {
        controller.enqueue(sse({ event }, "session-event"));
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
  moduleId: string;
  path: string;
  code: string;
}) {
  const targetPath = normalize(join(workspaceRoot, body.path));

  if (!targetPath.startsWith(generatedRuntimeRoot)) {
    return json({ ok: false, error: "surface path must stay inside apps/shell/generated" }, { status: 400 });
  }

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, body.code, "utf8");

  return json({
    ok: true,
    moduleId: body.moduleId,
    path: body.path
  });
}

await mkdir(generatedRuntimeRoot, { recursive: true });
initDb();

// When a watch fires, start a new agent turn with the result as context
setWatchCallback((watchId, label, result) => {
  const intent = `[watch fired: ${label}] exit=${result.exitCode}${result.stdout ? ` stdout=${result.stdout.slice(0, 500)}` : ""}${result.stderr ? ` stderr=${result.stderr.slice(0, 200)}` : ""}`;
  const task = createTask(intent);
  task.source.wakeMethod = "other";
  beginTurn(task, undefined, (input) => handleToolCall(input, eventState), "default", { eventState });
  console.log(`[watch] ${watchId} fired → turn for "${label}"`);
});

Bun.serve({
  port: 8787,
  idleTimeout: 120,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/health") {
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/events") {
      return json({ events: eventState });
    }

    if (request.method === "POST" && url.pathname === "/api/session/sync") {
      const body = await readBody<SloposSessionSnapshot>(request);
      syncSloposSession(body);
      return json({ ok: true });
    }

    if (request.method === "GET" && url.pathname === "/api/session/stream") {
      const sessionKey = url.searchParams.get("sessionKey") ?? "desktop-main";
      return streamSloposSessionEvents(sessionKey);
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/turns/") && url.pathname.endsWith("/stream")) {
      const turnId = url.pathname.slice("/api/turns/".length, -"/stream".length);
      return streamTurn(turnId);
    }

    if (request.method === "GET" && url.pathname === "/api/pty/stream") {
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

    if (request.method === "POST" && url.pathname === "/api/turns") {
      const body = await readBody<{ intent: string; context?: PlannerContext; sessionKey?: string }>(request);
      if (isPanicActive(eventState)) {
        return json({ ok: false, error: "system is in panic mode — dismiss panic before starting new turns" }, { status: 503 });
      }
      const task = createTask(body.intent);
      const turn = beginTurn(task, body.context, (input) => handleToolCall(input, eventState), body.sessionKey ?? "default", { eventState });
      return json({ turnId: turn.id, taskId: task.id });
    }

    if (request.method === "POST" && url.pathname === "/api/panic/dismiss") {
      exitPanicMode(eventState);
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname.startsWith("/api/turns/") && url.pathname.endsWith("/confirm")) {
      const turnId = url.pathname.slice("/api/turns/".length, -"/confirm".length);
      const body = await readBody<{ confirmationId: string; approved: boolean }>(request);
      const resolved = resolveTurnConfirmation(turnId, body.confirmationId, body.approved);
      return json({ ok: resolved });
    }

    if (request.method === "POST" && url.pathname === "/api/tools") {
      const body = await readBody<{ name: string; args?: Record<string, unknown>; options?: Record<string, unknown> }>(request);
      return json(await handleToolCall(body, eventState));
    }

    if (request.method === "GET" && url.pathname === "/api/config") {
      const config = await loadConfig();
      const maskedKeys: Record<string, string> = {};
      for (const [id, key] of Object.entries(config.keys)) {
        maskedKeys[id] = key.length > 8
          ? `${key.slice(0, 4)}...${key.slice(-4)}`
          : "****";
      }
      return json({
        provider: config.provider,
        model: config.model,
        baseUrl: config.baseUrl,
        keys: maskedKeys,
        providers: listProviders(config),
      });
    }

    if (request.method === "POST" && url.pathname === "/api/config") {
      const body = await readBody<Partial<SlopConfig>>(request);

      const current = await loadConfig();

      if (body.provider !== undefined) current.provider = body.provider;
      if (body.model !== undefined) current.model = body.model;
      if (body.baseUrl !== undefined) current.baseUrl = body.baseUrl;
      if (body.customProviders) current.customProviders = body.customProviders;

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
      return json({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/api/surfaces/write") {
      const body = await readBody<{ moduleId: string; path: string; code: string }>(request);
      return writeSurfaceModule(body);
    }

    return json({ ok: false, error: "not found" }, { status: 404 });
  }
});

console.log("slopOS bridge listening on http://127.0.0.1:8787");
