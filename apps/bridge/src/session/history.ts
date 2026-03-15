import { dbInsertHistory, dbGetRecentHistory, dbGetHistoryCount, dbPruneHistory } from "../db";

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

const MAX_HISTORY_PER_SESSION = 80;
const MAX_OUTPUT_CHARS = 6000;

let appendsSincePrune = 0;

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
  const clamped = clampRecord(record);
  dbInsertHistory(sessionKey, clamped.kind, clamped.taskId, clamped.timestamp, JSON.stringify(clamped));

  // Prune every 10 appends to keep the table bounded
  appendsSincePrune += 1;
  if (appendsSincePrune >= 10) {
    appendsSincePrune = 0;
    dbPruneHistory(sessionKey, MAX_HISTORY_PER_SESSION);
  }
}

export function getRecentHistory(sessionKey: string, limit = 24) {
  return dbGetRecentHistory(sessionKey, limit) as HistoryRecord[];
}

export function getHistoryDiagnostics() {
  // Lightweight — just report for the default session
  const count = dbGetHistoryCount("default");
  return {
    sessionCount: 1,
    recordsBySession: [{ sessionKey: "default", recordCount: count }]
  };
}

export type { HistoryRecord };
