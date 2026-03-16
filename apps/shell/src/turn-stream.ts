import type { TurnPart, TurnStreamEnvelope } from "@slopos/runtime";
import { connectEventStream, type ProtocolIssue } from "./event-stream";

export function connectTurnStream(
  turnId: string,
  handlers: {
    onPart: (part: TurnPart) => void;
    onError?: (issue?: ProtocolIssue) => void;
  }
) {
  return connectEventStream<TurnStreamEnvelope>({
    path: `/api/turns/${turnId}/stream`,
    event: "part",
    onMessage: (payload) => {
      handlers.onPart(payload.part as TurnPart);
    },
    onError: handlers.onError
  });
}
