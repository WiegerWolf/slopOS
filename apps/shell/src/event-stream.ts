import { CONTRACT_VERSIONS } from "@slopos/runtime";

export type ProtocolIssue = {
  message: string;
  expectedProtocolVersion?: number;
  receivedProtocolVersion?: number;
};

type VersionedEventEnvelope<T> = {
  protocolVersion?: number;
} & T;

export function connectVersionedEventStream<T>(input: {
  path: string;
  event: string;
  onMessage: (payload: VersionedEventEnvelope<T>) => void;
  onError?: (issue?: ProtocolIssue) => void;
}) {
  const separator = input.path.includes("?") ? "&" : "?";
  const source = new EventSource(`${input.path}${separator}protocolVersion=${CONTRACT_VERSIONS.bridgeProtocol}`);

  const handleMessage = (event: MessageEvent<string>) => {
    const payload = JSON.parse(event.data) as VersionedEventEnvelope<T>;
    if ((payload.protocolVersion ?? CONTRACT_VERSIONS.bridgeProtocol) > CONTRACT_VERSIONS.bridgeProtocol) {
      input.onError?.({
        message: "slopOS shell and bridge protocol versions do not match.",
        expectedProtocolVersion: CONTRACT_VERSIONS.bridgeProtocol,
        receivedProtocolVersion: payload.protocolVersion
      });
      source.close();
      return;
    }

    input.onMessage(payload);
  };

  source.addEventListener(input.event, handleMessage as EventListener);
  source.onerror = () => {
    input.onError?.();
  };

  return () => {
    source.removeEventListener(input.event, handleMessage as EventListener);
    source.close();
  };
}
