import type { Task, TurnPart } from "@slopos/runtime";

type TurnRecord = {
  id: string;
  createdAt: number;
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

export function createTurn(task: Task) {
  const record: TurnRecord = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    task,
    parts: [],
    closed: false,
    subscribers: new Set()
  };

  turns.set(record.id, record);
  return record;
}

export function getTurn(turnId: string) {
  return turns.get(turnId);
}

export function appendTurnPart(turnId: string, part: TurnPart) {
  const turn = turns.get(turnId);
  if (!turn || turn.closed) {
    return;
  }

  turn.parts.push(part);
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
