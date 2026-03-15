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
import { loadConfig, resolveEndpoint } from "./config";

export type PlannerContext = PlannerRuntimeContext;

// OpenAI-compatible response shape
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

// Anthropic Messages API response shape
type AnthropicResponse = {
  content?: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
};

function isAnthropicEndpoint(baseUrl: string): boolean {
  return baseUrl.includes("api.anthropic.com");
}

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
        "2. When ready, return ONLY valid JSON to create the surface. Do NOT include any additional text, explanations, or markdown formatting.",
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
        "You MUST return a valid JSON object matching this exact structure. Return ONLY the JSON, no additional text:",
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
        }, null, 2),
        "",
        "## Critical Formatting Rules",
        "1. Your response MUST be ONLY a valid JSON object",
        "2. Do NOT include any text before or after the JSON",
        "3. Do NOT use markdown code blocks (no ```json or ```)",
        "4. Do NOT add explanations or commentary",
        "5. Start your response directly with '{' and end with '}'",
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

const TOOL_SCHEMAS: Record<string, { description: string; parameters: Record<string, unknown> }> = {
  shell_exec: {
    description: "Run a shell command. Returns stdout, stderr, exitCode.",
    parameters: {
      type: "object",
      properties: {
        args: {
          type: "object",
          properties: {
            cmd: { type: "string", description: "Full shell command string (e.g. 'curl -s wttr.in/Amsterdam')" },
            cwd: { type: "string", description: "Working directory (optional)" },
          },
          required: ["cmd"],
        },
        options: {
          type: "object",
          properties: {
            timeoutMs: { type: "number", description: "Timeout in ms (default 30000)" },
            runAs: { type: "string", enum: ["root"], description: "Run as root via pkexec" },
          },
        },
      },
      required: ["args"],
    },
  },
  fs_read: {
    description: "Read a file from disk.",
    parameters: {
      type: "object",
      properties: {
        args: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      },
      required: ["args"],
    },
  },
  fs_write: {
    description: "Write content to a file.",
    parameters: {
      type: "object",
      properties: {
        args: {
          type: "object",
          properties: { path: { type: "string" }, content: { type: "string" } },
          required: ["path", "content"],
        },
      },
      required: ["args"],
    },
  },
  browser_open: {
    description: "Open a URL in the embedded browser.",
    parameters: {
      type: "object",
      properties: {
        args: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
      },
      required: ["args"],
    },
  },
  browser_active_tab: {
    description: "Get the currently focused browser tab.",
    parameters: { type: "object", properties: {} },
  },
  browser_page_snapshot: {
    description: "Get a text snapshot of the current browser page.",
    parameters: {
      type: "object",
      properties: {
        args: { type: "object", properties: { command: { type: "string", description: "Optional command like 'click', 'scroll', 'type'" } } },
      },
    },
  },
  audio_status: {
    description: "Get current audio/volume state.",
    parameters: { type: "object", properties: {} },
  },
  audio_control: {
    description: "Control audio: set_volume, toggle_mute, set_default.",
    parameters: {
      type: "object",
      properties: {
        args: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["set_volume", "toggle_mute", "set_default"] },
            targetId: { type: "string" },
            volume: { type: "number" },
            muted: { type: "boolean" },
          },
          required: ["action"],
        },
      },
      required: ["args"],
    },
  },
  network_status: {
    description: "Get network connection status.",
    parameters: { type: "object", properties: {} },
  },
  network_control: {
    description: "Control network: wifi_connect, wifi_disconnect, toggle_wifi.",
    parameters: {
      type: "object",
      properties: {
        args: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["wifi_connect", "wifi_disconnect", "toggle_wifi"] },
            ssid: { type: "string" },
            password: { type: "string" },
            device: { type: "string" },
          },
          required: ["action"],
        },
      },
      required: ["args"],
    },
  },
  pty_open: {
    description: "Open a new pseudo-terminal session.",
    parameters: {
      type: "object",
      properties: {
        args: { type: "object", properties: { command: { type: "string" }, cwd: { type: "string" } } },
      },
    },
  },
  pty_write: {
    description: "Write text to a PTY.",
    parameters: {
      type: "object",
      properties: {
        args: { type: "object", properties: { ptyId: { type: "string" }, input: { type: "string" } }, required: ["ptyId", "input"] },
      },
      required: ["args"],
    },
  },
  pty_snapshot: {
    description: "Get current PTY screen content.",
    parameters: {
      type: "object",
      properties: {
        args: { type: "object", properties: { ptyId: { type: "string" } }, required: ["ptyId"] },
      },
      required: ["args"],
    },
  },
  pty_close: {
    description: "Close a PTY session.",
    parameters: {
      type: "object",
      properties: {
        args: { type: "object", properties: { ptyId: { type: "string" } }, required: ["ptyId"] },
      },
      required: ["args"],
    },
  },
  system_control: {
    description: "System control actions: bluetooth_connect, bluetooth_disconnect, panic_dismiss.",
    parameters: {
      type: "object",
      properties: {
        args: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["bluetooth_connect", "bluetooth_disconnect", "panic_dismiss"] },
            args: { type: "object", properties: { id: { type: "string" } } },
          },
          required: ["action"],
        },
      },
      required: ["args"],
    },
  },
};

function toolDefinitions() {
  return listTools().map((tool) => {
    const schema = TOOL_SCHEMAS[tool.id];
    const safetyText =
      tool.safety === "read_only"
        ? "read-only"
        : tool.safety === "stateful"
          ? "stateful"
          : "destructive";

    const description = schema
      ? `${schema.description} [${safetyText}]`
      : `${tool.description}; ${safetyText}`;

    return {
      type: "function",
      function: {
        name: tool.id,
        description,
        parameters: schema?.parameters ?? {
          type: "object",
          properties: {
            args: { type: "object", additionalProperties: true },
            options: { type: "object", additionalProperties: true },
          },
        },
      },
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
  const config = await loadConfig();
  const ep = resolveEndpoint(config);
  const mode = readEnv("PILOT_PLANNER_MODE") ?? config.plannerMode ?? "auto";

  if (mode === "heuristic" || !ep.apiKey) {
    return {
      spec: heuristicPlannerSpec(task, context),
      source: ep.apiKey ? "heuristic" : "heuristic_no_key"
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
  const config = await loadConfig();
  const ep = resolveEndpoint(config);
  const mode = readEnv("PILOT_PLANNER_MODE") ?? config.plannerMode ?? "auto";

  if (mode === "heuristic" || !ep.apiKey) {
    return {
      step: heuristicNextAgentStep(task, context),
      source: ep.apiKey ? "heuristic" : "heuristic_no_key"
    };
  }

  const baseUrl = normalizeBaseUrl(ep.baseUrl);
  const model = ep.model;

  try {
    let payload: ChatCompletionResponse;

    if (isAnthropicEndpoint(baseUrl)) {
      // Anthropic Messages API — different format, different auth
      const anthropicTools = listTools().map((tool) => {
        const schema = TOOL_SCHEMAS[tool.id];
        return {
          name: tool.id,
          description: schema?.description ?? tool.description,
          input_schema: schema?.parameters ?? {
            type: "object" as const,
            properties: {
              args: { type: "object" as const, additionalProperties: true },
              options: { type: "object" as const, additionalProperties: true },
            },
          },
        };
      });

      const historyMessages = buildMessagesFromHistory(history);
      const anthropicMessages = [
        ...historyMessages,
        { role: "user" as const, content: plannerUserPrompt(task, context) },
      ];

      const response = await fetch(`${baseUrl}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ep.apiKey!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 16384,
          system: plannerSystemPrompt(),
          tools: anthropicTools,
          messages: anthropicMessages,
        }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`anthropic request failed: ${response.status} ${body}`);
      }

      const raw = (await response.json()) as AnthropicResponse;

      // Convert Anthropic response → ChatCompletionResponse shape
      const textParts = (raw.content ?? []).filter((c) => c.type === "text");
      const toolParts = (raw.content ?? []).filter((c) => c.type === "tool_use");
      const contentStr = textParts.map((c) => c.text ?? "").join("");
      const toolCalls = toolParts.map((c) => ({
        id: c.id,
        type: "function" as const,
        function: {
          name: c.name!,
          arguments: JSON.stringify(c.input ?? {}),
        },
      }));

      payload = {
        choices: [{
          message: {
            content: contentStr || undefined,
            tool_calls: toolCalls.length ? toolCalls : undefined,
          },
        }],
      };
    } else {
       // OpenAI-compatible endpoint
       const isCerebras = baseUrl.includes("api.cerebras.ai");
       const requestBody = {
         model,
         tools: toolDefinitions(),
         tool_choice: "auto",
         messages: [
           { role: "system", content: plannerSystemPrompt() },
           ...buildMessagesFromHistory(history),
           { role: "user", content: plannerUserPrompt(task, context) },
         ],
       };
       
       // Only add response_format for non-Cerebras endpoints since Cerebras may not support it
       if (!isCerebras) {
         // @ts-ignore: response_format may not be typed in our definitions but is supported by many OpenAI-compatible APIs
         requestBody.response_format = { type: "json_object" };
       }
       
       const response = await fetch(`${baseUrl}/chat/completions`, {
         method: "POST",
         headers: {
           "content-type": "application/json",
           authorization: `Bearer ${ep.apiKey}`,
         },
         body: JSON.stringify(requestBody),
       });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`planner request failed: ${response.status} ${body}`);
      }

      payload = (await response.json()) as ChatCompletionResponse;
    }

    const toolStep = toolCallsToStep(payload);
    if (toolStep) {
      return {
        step: toolStep,
        source: "cloud"
      };
    }

    const rawContent = extractContent(payload);
    console.debug("[planner] Raw content from model:", rawContent);
    let jsonStr: string | null = null;

    // Try to extract JSON from markdown code fences
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
    }

    // If not found in code fences, try to find JSON object by looking for first '{' and last '}'
    if (!jsonStr) {
        const firstBrace = rawContent.indexOf('{');
        const lastBrace = rawContent.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
            jsonStr = rawContent.substring(firstBrace, lastBrace + 1);
        }
    }

    // If we still don't have a candidate, or it doesn't look like a JSON object, throw an error.
    if (!jsonStr || !jsonStr.trim().startsWith('{') || !jsonStr.trim().endsWith('}')) {
        throw new Error(`planner returned invalid JSON: unable to extract JSON object from response: ${rawContent}`);
    }

    console.debug("[planner] Extracted JSON string:", jsonStr);
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
  } catch (err) {
    console.error("[planner]", err instanceof Error ? err.message : err);

    if (mode === "cloud") {
      throw new Error(`cloud planner failed: ${err instanceof Error ? err.message : String(err)}`);
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
