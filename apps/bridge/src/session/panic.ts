import type { EventState } from "../tool/types";

let consecutiveFailures = 0;
const PANIC_THRESHOLD = 3;

export function enterPanicMode(reason: string, eventState: EventState) {
  eventState["system.panic"] = {
    active: true,
    reason,
    timestamp: Date.now()
  };
  console.error(`[slopOS PANIC] ${reason}`);
}

export function exitPanicMode(eventState: EventState) {
  eventState["system.panic"] = undefined;
  consecutiveFailures = 0;
  console.log("[slopOS] Panic mode dismissed");
}

export function isPanicActive(eventState: EventState): boolean {
  return eventState["system.panic"]?.active === true;
}

export function recordTurnSuccess() {
  consecutiveFailures = 0;
}

export function recordTurnFailure(eventState: EventState, errorMessage?: string) {
  consecutiveFailures += 1;
  if (consecutiveFailures >= PANIC_THRESHOLD) {
    enterPanicMode(
      `${consecutiveFailures} consecutive turn failures. Last: ${errorMessage ?? "unknown"}`,
      eventState
    );
  }
}
