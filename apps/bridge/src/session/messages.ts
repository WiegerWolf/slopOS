import type { HistoryRecord } from "./history";

type ProviderMessage = {
  role: string;
  content?: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

export function buildMessagesFromHistory(history: HistoryRecord[]): ProviderMessage[] {
  const messages: ProviderMessage[] = [];

  for (const record of history) {
    switch (record.kind) {
      case "user_intent":
        messages.push({
          role: "user",
          content: `Earlier intent (${record.taskId}): ${record.intent}`
        });
        break;
      case "planner":
        messages.push({
          role: "assistant",
          content: `Planner status (${record.source}): ${record.statusText}`
        });
        break;
      case "tool_call":
        const toolCallId = record.toolCallId || `${record.taskId}-${record.timestamp}-${record.tool}`;
        messages.push({
          role: "assistant",
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: record.tool,
                arguments: JSON.stringify({
                  args: record.args ?? {},
                  options: record.options ?? {}
                })
              }
            }
          ]
        });
        break;
      case "tool_result":
        const resultToolCallId = record.toolCallId || `${record.taskId}-${record.timestamp}-${record.tool}`;
        messages.push({
          role: "tool",
          tool_call_id: resultToolCallId,
          name: record.tool,
          content: JSON.stringify({
            ok: record.ok,
            output: record.output ?? null,
            error: record.error ?? null
          })
        });
        break;
      case "summary":
        messages.push({
          role: "assistant",
          content: `Task summary: ${record.title} -- ${record.oneLine}`
        });
        break;
      case "error":
        messages.push({
          role: "assistant",
          content: `Task error: ${record.message}`
        });
        break;
    }
  }

  return messages;
}
