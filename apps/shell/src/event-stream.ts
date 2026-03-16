export type ProtocolIssue = {
  message: string;
};

export function connectEventStream<T>(input: {
  path: string;
  event: string;
  onMessage: (payload: T) => void;
  onError?: (issue?: ProtocolIssue) => void;
}) {
  const source = new EventSource(input.path);

  const handleMessage = (event: MessageEvent<string>) => {
    const payload = JSON.parse(event.data) as T;
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
