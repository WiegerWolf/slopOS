import type { Task } from "@slopos/runtime";
import { listCoreSurfaceDescriptors } from "@slopos/runtime";
import {
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

/**
 * Attempt JSON.parse, and on failure fix common LLM issues:
 * - Invalid backslash escapes inside strings (e.g. `\s`, `\d`, `\:`)
 *   are replaced with the literal character (dropping the backslash).
 */
function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    // Fix invalid escape sequences: replace \X (where X is not a valid
    // JSON escape char) with just X.  Valid JSON escapes: " \ / b f n r t u
    const fixed = input.replace(
      /\\(?!["\\/bfnrtu])/g,
      ""
    );
    return JSON.parse(fixed);
  }
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
  if (surfaceRecord.kind !== "existing" && surfaceRecord.kind !== "generated") {
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
        '  import { Card, Column, Row, Spacer, Tabs, Detail, Button, Toggle, Slider, Input, Select, Text, Badge, Dot, CodeBlock, Meter, FactGrid, Table, List, SectionList, Toast, Spinner } from "@slopos/ui";',
        '  import { useHost, useEvent, type SurfaceProps } from "@slopos/host";',
        "",
        "Component contract:",
        "  - Must export default function(props: SurfaceProps<YourDataType>)",
        "  - props.data contains whatever you put in surface.data",
        "  - useHost() returns { tool(name, args, opts), logStatus(msg), setRetention(mode), completeTask(summary) }",
        "  - tool() call signature: tool(name, args, options?) — args are passed FLAT, not wrapped.",
        '    CORRECT:   tool("shell_exec", { cmd: "kill 1234" })',
        '    CORRECT:   tool("shell_exec", { cmd: "mpv url" }, { background: true })',
        '    WRONG:     tool("shell_exec", { args: { cmd: "..." } })  // double-wraps args',
        "  - tool() returns the output directly (already unwrapped). For shell_exec:",
        "    const result = await tool(\"shell_exec\", { cmd: \"...\" });",
        "    result.stdout  // string — command stdout",
        "    result.stderr  // string — command stderr",
        "    result.exitCode // number",
        "    result.ok       // boolean",
        "    result.pid      // number (only when background: true)",
        "    // NOT result.output.stdout — tool() already returns the output object",
        "  - useEvent<T>(key) subscribes to live eventState (e.g. 'system.panic')",
        "",
        "UI components (import ONLY what you use):",
        "",
        "  Layout:",
        "    Card(title, subtitle?, children) — main container with title",
        "    Column(gap?, children), Row(gap?, children) — flex layout",
        "    Spacer() — flex spacer, pushes siblings apart",
        "    Tabs(tabs: {label, content}[]) — tabbed panels",
        "    Detail(summary, children, open?) — collapsible section",
        "",
        "  Actions:",
        "    Button(onClick, tone?, disabled?, children) — tone: 'primary'|'secondary'",
        "    Toggle(checked, onChange, label?) — on/off switch",
        "    Slider(value, onChange, min?, max?, label?) — range slider",
        "    Input(value, onChange, placeholder?, label?, type?) — text input",
        "    Select(value, onChange, options: {value,label}[], label?) — dropdown",
        "",
        "  Display:",
        "    Text(tone?, children) — paragraph. tone: 'primary'|'secondary'|'accent'|'muted'",
        "    Badge(tone?, children) — inline label",
        "    Dot(tone?, label?) — status dot. tone: 'green'|'red'|'yellow'|'muted'",
        "    CodeBlock(children: string, title?) — preformatted output",
        "    Spinner(label?) — loading indicator",
        "",
        "  Data:",
        "    Meter(value 0-100, label?) — progress bar",
        "    FactGrid(items: {label,value}[]) — key-value grid cards",
        "    Table(columns: {key,label,align?}[], rows: Record<string,ReactNode>[]) — data table",
        "    List(items: {label, value?, secondary?, right?: ReactNode}[]) — stacked list rows",
        "    SectionList(sections: {title, lines}[]) — grouped text sections",
        "    Toast(tone?, onDismiss?, children) — notification banner",
        "",
        "Styling rules — CRITICAL:",
        "  - The shell supports light and dark themes. NEVER use hardcoded colors (#hex, rgb, rgba).",
        "  - For any custom inline styles, use CSS variables for all colors and backgrounds:",
        "      Backgrounds: var(--surface), var(--surface-solid), var(--surface-hover)",
        "      Borders: var(--border), var(--border-subtle)",
        "      Text: var(--text), var(--text-strong), var(--text-muted), var(--text-dim)",
        "      Status: var(--status-green), var(--status-red), var(--status-yellow)",
        "      Accent: var(--accent), var(--error)",
        "  - For emphasis or visual hierarchy, use opacity or the provided tone props, not custom colors.",
        "  - Prefer using @slopos/ui components over raw HTML with inline styles.",
        "",
        "Rules for generated code:",
        "  - Embed tool results data directly in the component (in props.data or inline)",
        "  - Use useHost().tool() for interactive actions (buttons that run commands, etc.)",
        "  - Keep it focused — one card, clear data, useful actions",
        "  - TypeScript/TSX syntax, React functional component",
        "  - NO external imports beyond the three listed above",
        "",
        "## JSON Schema",
        "You MUST return a valid JSON object matching this exact structure. Return ONLY the JSON, no additional text:",
        JSON.stringify({
            statusText: "string — shown while working",
            summaryTitle: "string — Chronicle title",
            summaryLine: "string — Chronicle description",
            surface: {
                kind: "existing|generated",
                moduleId: "for existing: " + surfaces.map((s) => s.id).join("|"),
                title: "string",
                retention: "ephemeral|collapsed|persistent|pinned|background",
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
        "- For any task: gather data with shell_exec (pactl, nmcli, bluetoothctl, etc.), then generate a surface showing results.",
        "- For web pages: use generated with a browser_open tool call.",
        "- Always gather real data with tools before generating a surface. Never invent system state.",
        "- For long-running processes (audio/video players, servers, daemons): use shell_exec with options.background=true. This returns a pid you can embed in surface.data so the UI can kill it later via shell_exec('kill <pid>').",
        "- Use watch tool to monitor background conditions and react when they change.",
        "- Prefer generated surfaces. Use existing only when a pre-built surface fits perfectly."
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
    description: "Run a shell command. Returns stdout, stderr, exitCode. Use options.background=true for long-running processes (audio players, servers, etc.) — returns immediately with pid.",
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
            background: { type: "boolean", description: "Start process in background, return immediately with pid. Use for audio players, servers, long-running tasks." },
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
  set_theme: {
    description: "Set the slopOS shell theme. Use when the user asks to switch between light and dark mode.",
    parameters: {
      type: "object",
      properties: {
        args: {
          type: "object",
          properties: {
            theme: { type: "string", enum: ["light", "dark"], description: "The theme to apply" },
          },
          required: ["theme"],
        },
      },
      required: ["args"],
    },
  },
  watch: {
    description: "Start a background watch. Runs a shell command; when it exits, a new agent turn fires automatically with the result. Use for monitoring, waiting on conditions, reacting to system events.",
    parameters: {
      type: "object",
      properties: {
        args: {
          type: "object",
          properties: {
            cmd: { type: "string", description: "Shell command to run in background (e.g. 'inotifywait -e modify ./dist', 'sleep 60 && echo reminder')" },
            label: { type: "string", description: "Human-readable label for this watch" },
          },
          required: ["cmd"],
        },
      },
      required: ["args"],
    },
  },
  watch_list: {
    description: "List all active watches.",
    parameters: { type: "object", properties: {} },
  },
  watch_cancel: {
    description: "Cancel an active watch by id.",
    parameters: {
      type: "object",
      properties: {
        args: { type: "object", properties: { watchId: { type: "string" } }, required: ["watchId"] },
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
    throw new Error("no API key configured — open settings to add one");
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
    throw new Error("no API key configured — open settings to add one");
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

    // If we still don't have a candidate, try to handle common malformed responses
    if (!jsonStr) {
        // Handle responses that start with "Planner" followed by JSON-like content
        const plannerMatch = rawContent.match(/^Planner[\s\S]*?(\{[\s\S]*\})$/);
        if (plannerMatch) {
            jsonStr = plannerMatch[1].trim();
        }
        
        // Handle responses that look like field: value pairs (not in braces)
        if (!jsonStr) {
            // Look for patterns like "field: value" or "field\":\"value\""
            const fieldValueMatches = rawContent.match(/(\w+)\s*:\s*("[^"]*"|[^,\n]+)[,\n]/g);
            if (fieldValueMatches && fieldValueMatches.length > 0) {
                // Try to construct a JSON object from field: value pairs
                try {
                    const obj: Record<string, unknown> = {};
                    for (const match of fieldValueMatches) {
                        const [full, key, value] = match.match(/(\w+)\s*:\s*("[^"]*"|[^,\n]+)[,\n]/) || [];
                        if (key && value) {
                            // Clean up the value
                            let cleanValue = value.trim();
                            if (cleanValue.startsWith('"') && cleanValue.endsWith('"') && cleanValue.length > 1) {
                                cleanValue = cleanValue.substring(1, cleanValue.length - 1);
                            }
                            obj[key] = cleanValue;
                        }
                    }
                    if (Object.keys(obj).length > 0) {
                        jsonStr = JSON.stringify(obj);
                    }
                } catch (e) {
                    // If constructing JSON fails, continue to other strategies
                }
            }
        }
        
        // Handle plain status messages that could be used as statusText
        if (!jsonStr) {
            // Check if this looks like a status message we can use
            const trimmed = rawContent.trim();
            if (trimmed.length > 0 && !trimmed.startsWith('{')) {
                // Try to create a minimal valid PlannerSpec from the status message
                // This is a fallback when the model returns plain text instead of JSON
                try {
                    // Extract what looks like a status message
                    let statusText = trimmed;
                    
                    // Remove common prefixes
                    if (statusText.startsWith("Planner")) {
                        statusText = statusText.substring("Planner".length).trim();
                    }
                    if (statusText.startsWith("status") || statusText.startsWith("Status")) {
                        const colonIndex = statusText.indexOf(':');
                        if (colonIndex !== -1) {
                            statusText = statusText.substring(colonIndex + 1).trim();
                        }
                    }
                    if (statusText.startsWith("(local)") || statusText.startsWith("(cloud)")) {
                        const parenEnd = statusText.indexOf(')');
                        if (parenEnd !== -1) {
                            statusText = statusText.substring(parenEnd + 1).trim();
                        }
                    }
                    
                    // Clean up any leading colons or other punctuation
                    statusText = statusText.replace(/^[\s:\-]+/, '').trim();
                    
                    // If we have a reasonable status text, create a minimal spec
                    if (statusText.length > 0) {
                        // Create a minimal valid PlannerSpec structure
                        const minimalSpec = {
                            statusText: statusText,
                            summaryTitle: "Task in progress",
                            summaryLine: statusText,
                            surface: {
                                kind: "existing",
                                moduleId: "coding-workspace", // Default fallback
                                title: "Working on task",
                                retention: "pinned"
                            }
                        };
                        
                        jsonStr = JSON.stringify(minimalSpec);
                        console.debug("[planner] Constructed minimal JSON from status message:", jsonStr);
                    }
                } catch (e) {
                    // If constructing JSON fails, continue to throw error below
                }
            }
        }
    }

    // If we still don't have a candidate, or it doesn't look like a JSON object, throw an error.
    if (!jsonStr || !jsonStr.trim().startsWith('{') || !jsonStr.trim().endsWith('}')) {
        throw new Error(`planner returned invalid JSON: unable to extract JSON object from response: ${rawContent}`);
    }

    console.debug("[planner] Extracted JSON string:", jsonStr);
    const parsed = safeJsonParse(jsonStr);
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
      throw err;
    }
}

export async function planIntentWithCloud(task: Task, context?: PlannerContext) {
  const result = await planSpecWithCloud(task, context);
  return {
    response: planIntentFromSpec(task, result.spec),
    source: result.source
  };
}
