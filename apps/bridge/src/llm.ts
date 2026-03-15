import type { Task } from "@slopos/runtime";
import { listCoreSurfaceDescriptors } from "@slopos/runtime";
import {
  heuristicNextAgentStep,
  heuristicPlannerSpec,
  planIntentFromSpec,
  type AgentStep,
  type PlannerRuntimeContext,
  type PlannerSpec
} from "./agent";
import type { HistoryRecord } from "./session/history";
import { buildMessagesFromHistory } from "./session/messages";
import { listTools } from "./tool/registry";

export type PlannerContext = PlannerRuntimeContext;

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
  }>;
};

function readEnv(name: string) {
  const value = Bun.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

function normalizeBaseUrl(input?: string) {
  return (input ?? "https://api.openai.com/v1").replace(/\/$/, "");
}

function extractContent(response: ChatCompletionResponse) {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? "").join("");
  }

  return "";
}

function extractToolCalls(response: ChatCompletionResponse) {
  return response.choices?.[0]?.message?.tool_calls ?? [];
}

function coercePlannerSpec(value: unknown, task: Task): PlannerSpec | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybe = value as Record<string, unknown>;
  const surface = maybe.surface;

  if (
    typeof maybe.statusText !== "string" ||
    typeof maybe.summaryTitle !== "string" ||
    typeof maybe.summaryLine !== "string"
  ) {
    return null;
  }

  if (!surface || typeof surface !== "object") {
    return null;
  }

  const surfaceRecord = surface as Record<string, unknown>;
  if (surfaceRecord.kind !== "existing" && surfaceRecord.kind !== "runtime" && surfaceRecord.kind !== "browser") {
    return null;
  }

  return {
    statusText: maybe.statusText,
    summaryTitle: maybe.summaryTitle,
    summaryLine: maybe.summaryLine,
    surface: {
      kind: surfaceRecord.kind,
      moduleId:
        typeof surfaceRecord.moduleId === "string"
          ? (surfaceRecord.moduleId as PlannerSpec["surface"]["moduleId"])
          : undefined,
      title: typeof surfaceRecord.title === "string" ? surfaceRecord.title : task.intent,
      url: typeof surfaceRecord.url === "string" ? surfaceRecord.url : undefined,
      retention:
        surfaceRecord.retention === "ephemeral" ||
        surfaceRecord.retention === "collapsed" ||
        surfaceRecord.retention === "persistent" ||
        surfaceRecord.retention === "pinned" ||
        surfaceRecord.retention === "background"
          ? surfaceRecord.retention
          : "pinned",
      data:
        surfaceRecord.data && typeof surfaceRecord.data === "object"
          ? (surfaceRecord.data as Record<string, unknown>)
          : undefined,
      runtime:
        surfaceRecord.runtime && typeof surfaceRecord.runtime === "object"
          ? (surfaceRecord.runtime as PlannerSpec["surface"]["runtime"])
          : undefined
    }
  };
}

function plannerSystemPrompt() {
  const surfaces = listCoreSurfaceDescriptors();

  return [
    "You are the turn planner for a personal AI-operated Linux shell.",
    "You may either call tools to gather context or return a final JSON plan.",
    "When you need more information, emit tool calls instead of inventing state.",
    "When you are ready to materialize the UI, return only JSON for the final plan.",
    `Available existing surfaces: ${surfaces.map((surface) => surface.id).join(", ")}.`,
    `Surface descriptors: ${JSON.stringify(surfaces.map((surface) => ({
      id: surface.id,
      title: surface.title,
      subtitle: surface.subtitle,
      capabilities: surface.capabilities,
      refreshTool: surface.refreshTool ?? null
    })))}.`,
    "If no existing surface fits well, use kind=runtime and provide runtime title/subtitle/headline/body/primaryUrl/shellCommand/readPath, or use kind=browser for an embedded browser artifact with a URL.",
    "Allowed retention values: ephemeral, collapsed, persistent, pinned, background.",
    "Keep statusText concise and concrete.",
    "Final JSON schema:",
    JSON.stringify({
      statusText: "string",
      summaryTitle: "string",
      summaryLine: "string",
      surface: {
        kind: "existing|runtime|browser",
        url: "string",
        moduleId: surfaces.map((surface) => surface.id).join("|"),
        title: "string",
        retention: "ephemeral|collapsed|persistent|pinned|background",
        data: {},
        runtime: {
          title: "string",
          subtitle: "string",
          headline: "string",
          body: "string",
          badges: [{ label: "string", tone: "accent|muted|secondary|primary" }],
          facts: [{ label: "string", value: "string" }],
          sections: [{ title: "string", lines: ["string"] }],
          primaryUrl: "string",
          shellCommand: "string",
          readPath: "string"
        }
      }
    })
  ].join("\n");
}

function plannerUserPrompt(task: Task, context?: PlannerContext) {
  return JSON.stringify({
    intent: task.intent,
    currentShellContext: context ?? null,
    machineContext: {
      workspaceRoot: "/home/n/slopos",
      browserPrimary: "https://open.spotify.com",
      docsPrimary: "https://vite.dev/guide/",
      defaultReadPath: "/home/n/slopos/README.md"
    }
  });
}

function toolDefinitions() {
  const generic = {
    type: "object",
    properties: {
      args: {
        type: "object",
        additionalProperties: true
      },
      options: {
        type: "object",
        additionalProperties: true
      }
    },
    additionalProperties: false
  };

  return listTools().map((tool) => {
    const safetyText =
      tool.safety === "read_only"
        ? "read-only; does not change machine state"
        : tool.safety === "stateful"
          ? "changes live session or app state"
          : "potentially destructive or irreversible";

    return {
      type: "function",
      function: {
        name: tool.name,
        description: `${tool.description}; ${safetyText}${tool.requiresConfirmation ? "; may require confirmation depending on inputs" : ""}`,
        parameters: generic
      }
    };
  });
}

function toolCallsToStep(response: ChatCompletionResponse): AgentStep | null {
  const calls = extractToolCalls(response)
    .map((call) => {
      const name = call.function?.name;
      if (!name) {
        return null;
      }

      let parsed: Record<string, unknown> = {};
      try {
        parsed = call.function?.arguments
          ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
          : {};
      } catch {
        parsed = {};
      }

      return {
        name,
        args:
          parsed.args && typeof parsed.args === "object"
            ? (parsed.args as Record<string, unknown>)
            : undefined,
        options:
          parsed.options && typeof parsed.options === "object"
            ? (parsed.options as Record<string, unknown>)
            : undefined
      };
    })
    .filter((call): call is NonNullable<typeof call> => Boolean(call));

  if (!calls.length) {
    return null;
  }

  return {
    kind: "tool_calls",
    statusText: calls.length === 1 ? `Running ${calls[0].name}` : `Running ${calls.length} tools`,
    calls
  };
}

export async function planSpecWithCloud(task: Task, context?: PlannerContext) {
  const mode = readEnv("PILOT_PLANNER_MODE") ?? "auto";
  const apiKey = readEnv("OPENAI_API_KEY");

  if (mode === "heuristic" || !apiKey) {
    return {
      spec: heuristicPlannerSpec(task, context),
      source: apiKey ? "heuristic" : "heuristic_no_key"
    };
  }

  const step = await nextAgentStepWithCloud(task, context);
  if (step.step.kind !== "final") {
    throw new Error("cloud planner returned tool calls when a final spec was required");
  }

  return {
    spec: step.step.spec,
    source: step.source
  };
}

export async function nextAgentStepWithCloud(task: Task, context?: PlannerContext, history: HistoryRecord[] = []) {
  const mode = readEnv("PILOT_PLANNER_MODE") ?? "auto";
  const apiKey = readEnv("OPENAI_API_KEY");

  if (mode === "heuristic" || !apiKey) {
    return {
      step: heuristicNextAgentStep(task, context),
      source: apiKey ? "heuristic" : "heuristic_no_key"
    };
  }

  const baseUrl = normalizeBaseUrl(readEnv("OPENAI_BASE_URL"));
  const model = readEnv("PILOT_MODEL") ?? readEnv("OPENAI_MODEL") ?? "gpt-5.4";

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        tools: toolDefinitions(),
        tool_choice: "auto",
        messages: [
          { role: "system", content: plannerSystemPrompt() },
          ...buildMessagesFromHistory(history),
          { role: "user", content: plannerUserPrompt(task, context) }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`planner request failed: ${response.status}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const toolStep = toolCallsToStep(payload);
    if (toolStep) {
      return {
        step: toolStep,
        source: "cloud"
      };
    }

    const parsed = JSON.parse(extractContent(payload));
    const spec = coercePlannerSpec(parsed, task);

    if (!spec) {
      throw new Error("planner returned invalid JSON schema");
    }

    return {
      step: {
        kind: "final",
        spec
      } satisfies AgentStep,
      source: "cloud"
    };
  } catch {
    if (mode === "cloud") {
      throw new Error("cloud planner failed and fallback is disabled");
    }

    return {
      step: heuristicNextAgentStep(task, context),
      source: "heuristic_fallback"
    };
  }
}

export async function planIntentWithCloud(task: Task, context?: PlannerContext) {
  const result = await planSpecWithCloud(task, context);
  return {
    response: planIntentFromSpec(task, result.spec),
    source: result.source
  };
}
