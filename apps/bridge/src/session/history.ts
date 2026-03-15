import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CONTRACT_VERSIONS } from "@slopos/runtime";

type HistoryRecord =
  | {
      kind: "user_intent";
      timestamp: number;
      taskId: string;
      intent: string;
    }
  | {
      kind: "planner";
      timestamp: number;
      taskId: string;
      statusText: string;
      source: string;
    }
  | {
      kind: "tool_call";
      timestamp: number;
      taskId: string;
      toolCallId: string;
      tool: string;
      args?: Record<string, unknown>;
      options?: Record<string, unknown>;
    }
  | {
      kind: "tool_result";
      timestamp: number;
      taskId: string;
      toolCallId: string;
      tool: string;
      ok: boolean;
      output?: unknown;
      error?: string;
    }
  | {
      kind: "summary";
      timestamp: number;
      taskId: string;
      title: string;
      oneLine: string;
    }
  | {
      kind: "error";
      timestamp: number;
      taskId: string;
      message: string;
    };

const historyBySession = new Map<string, HistoryRecord[]>();
const historyFile = join("/home/n/slopos", ".slopos", "bridge-history.json");
const legacyHistoryFile = join("/home/n/slopos", ".pilot", "bridge-history.json");

type PersistedHistoryEnvelope = {
  version: number;
  sessions: Record<string, HistoryRecord[]>;
};

function migrateHistoryEnvelope(
  input: PersistedHistoryEnvelope | Record<string, HistoryRecord[]>,
): PersistedHistoryEnvelope | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  if ("version" in input && "sessions" in input) {
    const envelope = input as PersistedHistoryEnvelope;
    if (envelope.version > CONTRACT_VERSIONS.bridgeHistory) {
      return null;
    }

    if (envelope.version === CONTRACT_VERSIONS.bridgeHistory) {
      return envelope;
    }

    return {
      version: CONTRACT_VERSIONS.bridgeHistory,
      sessions: envelope.sessions ?? {}
    };
  }

  return {
    version: CONTRACT_VERSIONS.bridgeHistory,
    sessions: input as Record<string, HistoryRecord[]>
  };
}

let persistChain = Promise.resolve();

function serializeHistory() {
  return JSON.stringify(
    {
      version: CONTRACT_VERSIONS.bridgeHistory,
      sessions: Object.fromEntries(historyBySession.entries())
    } satisfies PersistedHistoryEnvelope,
    null,
    2
  );
}

async function persistHistory() {
  const tmpFile = `${historyFile}.tmp`;
  await mkdir(dirname(historyFile), { recursive: true });
  await writeFile(tmpFile, serializeHistory(), "utf8");
  await rename(tmpFile, historyFile);
}

function schedulePersist() {
  persistChain = persistChain
    .catch(() => undefined)
    .then(() => persistHistory())
    .catch(() => undefined);
}

export async function initializeHistory() {
  try {
    let raw: string;
    try {
      raw = await readFile(historyFile, "utf8");
    } catch {
      raw = await readFile(legacyHistoryFile, "utf8");
    }
    const parsed = JSON.parse(raw) as PersistedHistoryEnvelope | Record<string, HistoryRecord[]>;
    const migrated = migrateHistoryEnvelope(parsed);
    if (!migrated) {
      return;
    }
    const sessions = migrated.sessions;

    for (const [sessionKey, records] of Object.entries(sessions)) {
      historyBySession.set(
        sessionKey,
        Array.isArray(records) ? records.slice(-80) : []
      );
    }
    schedulePersist();
  } catch {
    return;
  }
}

const MAX_OUTPUT_CHARS = 6000;

function clampRecord(record: HistoryRecord): HistoryRecord {
  if (record.kind !== "tool_result") return record;
  const raw = typeof record.output === "string" ? record.output : JSON.stringify(record.output ?? null);
  if (raw.length <= MAX_OUTPUT_CHARS) return record;
  return {
    ...record,
    output: raw.slice(0, MAX_OUTPUT_CHARS) + `\n...[truncated ${raw.length - MAX_OUTPUT_CHARS} chars]`
  };
}

export function appendHistory(sessionKey: string, record: HistoryRecord) {
  const current = historyBySession.get(sessionKey) ?? [];
  current.push(clampRecord(record));
  historyBySession.set(sessionKey, current.slice(-80));
  schedulePersist();
}

export function getRecentHistory(sessionKey: string, limit = 24) {
  const current = historyBySession.get(sessionKey) ?? [];
  return current.slice(-limit);
}

export function getHistoryFilePath() {
  return historyFile;
}

export function getHistoryDiagnostics() {
  const sessions = Array.from(historyBySession.entries());
  return {
    sessionCount: sessions.length,
    recordsBySession: sessions.map(([sessionKey, records]) => ({
      sessionKey,
      recordCount: records.length,
      latestTimestamp: records[records.length - 1]?.timestamp
    }))
  };
}

export type { HistoryRecord };
