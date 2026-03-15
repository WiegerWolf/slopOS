import type { Task, TurnPart } from "@slopos/runtime";
import { dbInsertTurn, dbCloseTurn, dbInsertTurnPart, dbGetTurn, dbGetTurnParts } from "../db";

type TurnRecord = {
  id: string;
  createdAt: number;
  sessionKey: string;
  task: Task;
  parts: TurnPart[];
  closed: boolean;
  pendingConfirmation?: {
    id: string;
    resolve: (approved: boolean) => void;
  };
  subscribers: Set<(part: TurnPart) => void>;
};

const turns = new Map<string, TurnRecord>();

export function createTurn(task: Task, sessionKey = "default") {
  const record: TurnRecord = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    sessionKey,
    task,
    parts: [],
    closed: false,
    subscribers: new Set()
  };

  turns.set(record.id, record);

  // Persist to SQLite
  dbInsertTurn(record.id, task.id, sessionKey, record.createdAt, JSON.stringify(task));

  return record;
}

export function getTurn(turnId: string) {
  // Check in-memory first (active turns)
  const inMemory = turns.get(turnId);
  if (inMemory) return inMemory;

  // Fall back to SQLite for completed turns from previous sessions
  const row = dbGetTurn(turnId);
  if (!row) return undefined;

  const restored: TurnRecord = {
    id: row.id,
    createdAt: row.created_at,
    sessionKey: row.session_key,
    task: JSON.parse(row.task_json),
    parts: dbGetTurnParts(turnId),
    closed: row.closed === 1,
    subscribers: new Set()
  };

  // Cache in memory for repeated access
  turns.set(turnId, restored);
  return restored;
}

export function appendTurnPart(turnId: string, part: TurnPart) {
  const turn = turns.get(turnId);
  if (!turn || turn.closed) {
    return;
  }

  const seq = turn.parts.length;
  turn.parts.push(part);

  // Persist to SQLite
  dbInsertTurnPart(part.id, turnId, seq, JSON.stringify(part));

  for (const subscriber of turn.subscribers) {
    subscriber(part);
  }
}

export function closeTurn(turnId: string) {
  const turn = turns.get(turnId);
  if (!turn) {
    return;
  }

  turn.closed = true;

  // Persist to SQLite
  dbCloseTurn(turnId);
}

export function waitForTurnConfirmation(turnId: string, confirmationId: string) {
  const turn = turns.get(turnId);
  if (!turn) {
    return Promise.reject(new Error(`unknown turn ${turnId}`));
  }

  return new Promise<boolean>((resolve) => {
    turn.pendingConfirmation = {
      id: confirmationId,
      resolve
    };
  });
}

export function resolveTurnConfirmation(turnId: string, confirmationId: string, approved: boolean) {
  const turn = turns.get(turnId);
  if (!turn?.pendingConfirmation) {
    return false;
  }

  if (turn.pendingConfirmation.id !== confirmationId) {
    return false;
  }

  const pending = turn.pendingConfirmation;
  turn.pendingConfirmation = undefined;
  pending.resolve(approved);
  return true;
}

export function subscribeTurn(turnId: string, onPart: (part: TurnPart) => void) {
  const turn = turns.get(turnId);
  if (!turn) {
    return () => undefined;
  }

  turn.subscribers.add(onPart);
  return () => {
    turn.subscribers.delete(onPart);
  };
}

export function getTurnDiagnostics() {
  const values = Array.from(turns.values());
  return {
    totalTurns: values.length,
    activeTurns: values.filter((turn) => !turn.closed).length,
    closedTurns: values.filter((turn) => turn.closed).length,
    pendingConfirmations: values.filter((turn) => Boolean(turn.pendingConfirmation)).length,
    recentTurns: values
      .slice(-8)
      .reverse()
      .map((turn) => ({
        id: turn.id,
        taskId: turn.task.id,
        intent: turn.task.intent,
        closed: turn.closed,
        partCount: turn.parts.length,
        createdAt: turn.createdAt
      }))
  };
}
