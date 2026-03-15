import { appendTurnPart, closeTurn } from "./store";

export type WatchdogHandle = {
  turnId: string;
  taskId: string;
  timer: ReturnType<typeof setTimeout>;
};

export function startWatchdog(turnId: string, taskId: string, timeoutMs = 60000): WatchdogHandle {
  const timer = setTimeout(() => {
    appendTurnPart(turnId, {
      id: crypto.randomUUID(),
      turnId,
      taskId,
      timestamp: Date.now(),
      kind: "turn_error",
      message: `turn watchdog fired after ${timeoutMs}ms — possible hang`
    });
    closeTurn(turnId);
  }, timeoutMs);

  return { turnId, taskId, timer };
}

export function resetWatchdog(handle: WatchdogHandle, timeoutMs = 60000): WatchdogHandle {
  clearTimeout(handle.timer);
  return startWatchdog(handle.turnId, handle.taskId, timeoutMs);
}

export function stopWatchdog(handle: WatchdogHandle) {
  clearTimeout(handle.timer);
}
