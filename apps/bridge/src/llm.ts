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
  if (surfaceRecord.kind !== "existing" && surfaceRecord.kind !== "runtime" && surfaceRecord.kind !== "browser" && surfaceRecord.kind !== "generated") {
    return null;
  }

  const generatedObj = surfaceRecord.generated as Record<string, unknown> | undefined;

  return {
    statusText: maybe.statusText,
    summaryTitle: maybe.summaryTitle,
    summaryLine: maybe.summaryLine,
    surface: {
      kind: surfaceRecord.kind as PlannerSpec["surface"]["kind"],
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
          : undefined,
      generated:
        generatedObj && typeof generatedObj.code === "string"
          ? {
              code: generatedObj.code,
              title: typeof generatedObj.title === "string" ? generatedObj.title : task.intent
            }
          : undefined
    }
  };
}

function plannerSystemPrompt() {
  const surfaces = listCoreSurfaceDescriptors();

  return [
    "You are the turn planner for slopOS, a personal AI-operated Linux shell.",
    "Your job: understand the user's intent, gather context with tools, then materialize a UI surface.",
    "",
    "## Flow",
    "1. Call tools to gather real system state (shell commands, file reads, audio/network/bluetooth status).",
    "2. When ready, return JSON to create the surface.",
    "",
    "## Surface Kinds",
    "",
    "### existing — pre-built surfaces (use when one fits perfectly)",
    `Available: ${surfaces.map((s) => `${s.id} (${s.subtitle})`).join("; ")}`,
    "",
    "### generated — YOU WRITE THE TSX (preferred for custom tasks)",
    "Write a complete React component as a string in surface.generated.code.",
    "This is your superpower. Write task-specific, data-driven UI from the tool results you gathered.",
    "",
    "Available imports (ONLY these — no other packages exist):",
    '  import React from "react";',
    '  import { Badge, Button, Card, Column, Row, Text, Meter, FactGrid, SectionList } from "@slopos/ui";',
    '  import { useHost, useEvent, type SurfaceProps } from "@slopos/host";',
    "",
    "Component contract:",
    "  - Must export default function(props: SurfaceProps<YourDataType>)",
    "  - props.data contains whatever you put in surface.data",
    "  - useHost() returns { tool(name, args, opts), logStatus(msg), setRetention(mode), completeTask(summary) }",
    "  - useEvent<T>(key) subscribes to live eventState (e.g. 'audio.state', 'network.state', 'bluetooth.devices')",
    "",
    "UI components:",
    "  Card(title, subtitle, children) — main container",
    "  Column(gap, children), Row(gap, children) — layout",
    "  Text(tone?, children), Badge(tone?, children) — text display. tone: 'accent'|'muted'|'secondary'|'primary'",
    "  Button(onClick, tone?, children) — actions. tone: 'secondary' for less emphasis",
    "  Meter(value 0-100, label?) — progress/level bar",
    "  FactGrid(items: {label,value}[]) — key-value pairs",
    "  SectionList(sections: {title, lines}[]) — grouped text",
    "",
    "Rules for generated code:",
    "  - Embed tool results data directly in the component (in props.data or inline)",
    "  - Use useHost().tool() for interactive actions (buttons that run commands, etc.)",
    "  - Keep it focused — one card, clear data, useful actions",
    "  - TypeScript/TSX syntax, React functional component",
    "  - NO external imports beyond the three listed above",
    "",
    "### browser — an embedded browser pane (for web URLs)",
    "Set surface.url to the target URL.",
    "",
    "### runtime — legacy template surface (avoid, use generated instead)",
    "",
    "## JSON Schema",
    JSON.stringify({
      statusText: "string — shown while working",
      summaryTitle: "string — Chronicle title",
      summaryLine: "string — Chronicle description",
      surface: {
        kind: "existing|generated|browser|runtime",
        moduleId: "for existing: " + surfaces.map((s) => s.id).join("|"),
        title: "string",
        retention: "ephemeral|collapsed|persistent|pinned|background",
        url: "for browser: target URL",
        data: "object — passed to component as props.data",
        generated: {
          code: "string — full TSX source code",
          title: "string — surface title"
        }
      }
    }),
    "",
    "## Strategy",
    "- For system controls (audio, network, bluetooth): use existing surfaces — they have live event subscriptions.",
    "- For information display, analysis, status dashboards: use generated — write a surface that shows the data you gathered.",
    "- For web pages: use browser.",
    "- Always gather real data with tools before generating a surface. Never invent system state.",
    "- Prefer generated surfaces over runtime. Runtime is a fixed template with limited fields."
  ].join("\n");
}

function plannerUserPrompt(task: Task, context?: PlannerContext) {
  return JSON.stringify({
    intent: task.intent,
    currentShellContext: context ?? null,
    machineContext: {
      workspaceRoot: "/home/n/slopos",
      user: "n",
      platform: "linux"
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

    const rawContent = extractContent(payload);
    // Extract JSON from response — handle markdown code fences
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : rawContent.trim();
    const parsed = JSON.parse(jsonStr);
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
