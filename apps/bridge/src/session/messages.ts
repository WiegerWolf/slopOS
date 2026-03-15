import type { HistoryRecord } from "./history";

const MAX_TOOL_OUTPUT_CHARS = 4000;

function truncateOutput(value: unknown): string {
  const str = typeof value === "string" ? value : JSON.stringify(value ?? null);
  if (str.length <= MAX_TOOL_OUTPUT_CHARS) return str;
  return str.slice(0, MAX_TOOL_OUTPUT_CHARS) + `\n...[truncated ${str.length - MAX_TOOL_OUTPUT_CHARS} chars]`;
}

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
  // Collect tool_call IDs present in this slice of history so we can
  // drop orphaned tool_results whose matching tool_call was sliced off.
  // Also track which IDs have already been consumed to deduplicate
  // (confirmation retries can produce two tool_results for one tool_call).
  const toolCallIds = new Set<string>();
  for (const record of history) {
    if (record.kind === "tool_call") {
      toolCallIds.add(record.toolCallId || `${record.taskId}-${record.timestamp}-${record.tool}`);
    }
  }
  const consumedToolCallIds = new Set<string>();

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
      case "tool_call": {
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
      }
      case "tool_result": {
        const resultToolCallId = record.toolCallId || `${record.taskId}-${record.timestamp}-${record.tool}`;
        // Skip orphaned tool_results whose tool_call was sliced off,
        // and skip duplicates (e.g. confirmation retries reuse the same ID)
        if (!toolCallIds.has(resultToolCallId)) break;
        if (consumedToolCallIds.has(resultToolCallId)) break;
        consumedToolCallIds.add(resultToolCallId);
        messages.push({
          role: "tool",
          tool_call_id: resultToolCallId,
          name: record.tool,
          content: truncateOutput({
            ok: record.ok,
            output: record.output ?? null,
            error: record.error ?? null
          })
        });
        break;
      }
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

  // Drop tool_call messages whose tool_result was sliced off — the API
  // may reject an assistant tool_calls message with no matching tool response.
  const resultIds = new Set<string>();
  for (const msg of messages) {
    if (msg.role === "tool" && msg.tool_call_id) resultIds.add(msg.tool_call_id);
  }

  const filtered = messages.filter((msg) => {
    if (msg.role === "assistant" && msg.tool_calls?.length) {
      return msg.tool_calls.every((tc) => resultIds.has(tc.id));
    }
    return true;
  });

  // Merge consecutive assistant messages. APIs require that a tool-role
  // message is immediately preceded by an assistant message with tool_calls.
  // Without merging, a planner content message followed by a tool_call
  // message creates two separate assistant entries, breaking this contract.
  const merged: ProviderMessage[] = [];
  for (const msg of filtered) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === "assistant" && msg.role === "assistant") {
      // Merge content
      if (msg.content) {
        prev.content = prev.content ? `${prev.content}\n${msg.content}` : msg.content;
      }
      // Merge tool_calls
      if (msg.tool_calls?.length) {
        prev.tool_calls = [...(prev.tool_calls ?? []), ...msg.tool_calls];
      }
    } else {
      merged.push({ ...msg });
    }
  }

  return merged;
}
