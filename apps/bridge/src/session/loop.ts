import type { PlannerContext } from "../llm";
import { planIntentFromSpec, type PlannerRuntimeContext, type PlannerSpec } from "../agent";
import { nextAgentStepWithCloud } from "../llm";
import { appendHistory, getRecentHistory } from "./history";
import { appendTurnPart, closeTurn, createTurn, waitForTurnConfirmation } from "./store";
import { startWatchdog, resetWatchdog, stopWatchdog } from "./watchdog";
import { recordTurnSuccess, recordTurnFailure } from "./panic";
import type { Task, TurnPart } from "@slopos/runtime";
import type { EventState, ToolResult } from "../tool/types";

type ToolRunner = (input: {
  name: string;
  args?: Record<string, unknown>;
  options?: Record<string, unknown>;
}) => Promise<ToolResult>;

type TurnOptions = {
  eventState?: EventState;
};

const MAX_PLANNER_ITERATIONS = 64;

function turnPartBase(turnId: string, taskId: string) {
  return {
    id: crypto.randomUUID(),
    turnId,
    taskId,
    timestamp: Date.now()
  };
}

export function beginTurn(task: Task, context: PlannerContext | undefined, runTool: ToolRunner, sessionKey = "default", options?: TurnOptions) {
  const turn = createTurn(task, sessionKey);

  appendHistory(sessionKey, {
    kind: "user_intent",
    timestamp: Date.now(),
    taskId: task.id,
    intent: task.intent
  });

  appendTurnPart(turn.id, {
    ...turnPartBase(turn.id, task.id),
    kind: "turn_start",
    task
  });

  void runTurn(turn.id, task, context, runTool, sessionKey, options);

  return turn;
}

async function runTurn(
  turnId: string,
  task: Task,
  context: PlannerContext | undefined,
  runTool: ToolRunner,
  sessionKey: string,
  options?: TurnOptions
) {
  let watchdog = startWatchdog(turnId, task.id);

  try {
    const toolResults: PlannerRuntimeContext["toolResults"] = [];
    let spec: PlannerSpec | undefined;
    let source;

    for (let iteration = 0; iteration < MAX_PLANNER_ITERATIONS; iteration += 1) {
      const recentHistory = getRecentHistory(sessionKey);
      const planned = await nextAgentStepWithCloud(task, {
        ...(context ?? {}),
        iteration,
        toolResults,
        recentHistory: recentHistory.map((record) => ({
          kind: record.kind,
          taskId: record.taskId,
          summary:
            record.kind === "user_intent"
              ? record.intent
              : record.kind === "planner"
                ? record.statusText
                : record.kind === "tool_call"
                  ? `${record.tool} requested`
                  : record.kind === "tool_result"
                    ? `${record.tool} ${record.ok ? "succeeded" : "failed"}`
                    : record.kind === "summary"
                      ? `${record.title}: ${record.oneLine}`
                      : record.message
        }))
      }, recentHistory);
      source = planned.source;

      appendHistory(sessionKey, {
        kind: "planner",
        timestamp: Date.now(),
        taskId: task.id,
        statusText: planned.step.kind === "final" ? planned.step.spec.statusText : planned.step.statusText,
        source
      });

      appendTurnPart(turnId, {
        ...turnPartBase(turnId, task.id),
        kind: "planner",
        plannerSource: source,
        statusText: planned.step.kind === "final" ? planned.step.spec.statusText : planned.step.statusText
      });

      if (planned.step.kind === "final") {
        spec = planned.step.spec;
        break;
      }

      let shouldReplan = false;
      for (const tool of planned.step.calls) {
        const toolCallId = crypto.randomUUID();

        appendHistory(sessionKey, {
          kind: "tool_call",
          timestamp: Date.now(),
          taskId: task.id,
          toolCallId,
          tool: tool.name,
          args: tool.args,
          options: tool.options
        });

        appendTurnPart(turnId, {
          ...turnPartBase(turnId, task.id),
          kind: "tool_call",
          tool: {
            name: tool.name,
            args: tool.args,
            options: tool.options
          }
        });

        const result = await runTool({
          name: tool.name,
          args: tool.args,
          options: tool.options
        });

        toolResults.push({
          name: tool.name,
          ok: result.ok,
          output: result.output,
          error: result.error
        });

        appendHistory(sessionKey, {
          kind: "tool_result",
          timestamp: Date.now(),
          taskId: task.id,
          toolCallId,
          tool: tool.name,
          ok: result.ok,
          output: result.output,
          error: result.error
        });

        appendTurnPart(turnId, {
          ...turnPartBase(turnId, task.id),
          kind: "tool_result",
          tool: {
            name: tool.name
          },
          ok: result.ok,
          output: result.output,
          error: result.error
        });

        watchdog = resetWatchdog(watchdog);

        if (!result.ok) {
          appendHistory(sessionKey, {
            kind: "error",
            timestamp: Date.now(),
            taskId: task.id,
            message: result.error ?? `${tool.name} failed`
          });

          if (result.confirmationRequired) {
            const confirmationId = crypto.randomUUID();
            appendTurnPart(turnId, {
              ...turnPartBase(turnId, task.id),
              kind: "confirmation_request",
              confirmation: {
                id: confirmationId,
                title: result.confirmationRequired.title,
                message: result.confirmationRequired.message,
                tool: {
                  name: tool.name,
                  args: tool.args
                }
              }
            });

            const approved = await waitForTurnConfirmation(turnId, confirmationId);

            appendTurnPart(turnId, {
              ...turnPartBase(turnId, task.id),
              kind: "confirmation_result",
              confirmation: {
                id: confirmationId,
                approved
              }
            });

            if (!approved) {
              appendTurnPart(turnId, {
                ...turnPartBase(turnId, task.id),
                kind: "turn_error",
                message: "user declined confirmation"
              });
              return;
            }

            const confirmedResult = await runTool({
              name: tool.name,
              args: tool.args,
              options: {
                ...(tool.options ?? {}),
                confirm: true
              }
            });

            toolResults.push({
              name: tool.name,
              ok: confirmedResult.ok,
              output: confirmedResult.output,
              error: confirmedResult.error
            });

            const confirmedToolCallId = crypto.randomUUID();
            appendHistory(sessionKey, {
              kind: "tool_call",
              timestamp: Date.now(),
              taskId: task.id,
              toolCallId: confirmedToolCallId,
              tool: tool.name,
              args: tool.args,
              options: { ...(tool.options ?? {}), confirm: true }
            });

            appendHistory(sessionKey, {
              kind: "tool_result",
              timestamp: Date.now(),
              taskId: task.id,
              toolCallId: confirmedToolCallId,
              tool: tool.name,
              ok: confirmedResult.ok,
              output: confirmedResult.output,
              error: confirmedResult.error
            });

            appendTurnPart(turnId, {
              ...turnPartBase(turnId, task.id),
              kind: "tool_result",
              tool: {
                name: tool.name
              },
              ok: confirmedResult.ok,
              output: confirmedResult.output,
              error: confirmedResult.error
            });

            if (!confirmedResult.ok) {
              appendTurnPart(turnId, {
                ...turnPartBase(turnId, task.id),
                kind: "turn_error",
                message: confirmedResult.error ?? `${tool.name} failed after confirmation`
              });
              return;
            }

            shouldReplan = true;
            break;
          }

          // Non-confirmation failure: let the planner see the error and try a different approach
          shouldReplan = true;
          break;
        }
      }

      if (shouldReplan) {
        continue;
      }
    }

    if (!spec) {
      throw new Error(`planner did not produce a result after ${MAX_PLANNER_ITERATIONS} iterations`);
    }

    const response = planIntentFromSpec(task, spec);

    const complete = response.operations.find((operation) => operation.type === "complete_task");
    if (complete?.type === "complete_task") {
      appendHistory(sessionKey, {
        kind: "summary",
        timestamp: Date.now(),
        taskId: task.id,
        title: complete.summary.title,
        oneLine: complete.summary.oneLine
      });
    }

    for (const operation of response.operations) {
      appendTurnPart(turnId, {
        ...turnPartBase(turnId, task.id),
        kind: "operation",
        operation
      });
    }

    appendTurnPart(turnId, {
      ...turnPartBase(turnId, task.id),
      kind: "turn_complete"
    });
    recordTurnSuccess();
  } catch (error) {
    const message = error instanceof Error ? error.message : "turn failed";
    appendHistory(sessionKey, {
      kind: "error",
      timestamp: Date.now(),
      taskId: task.id,
      message
    });
    appendTurnPart(turnId, {
      ...turnPartBase(turnId, task.id),
      kind: "turn_error",
      message
    });

    if (options?.eventState) {
      recordTurnFailure(options.eventState, message);
    }
  } finally {
    stopWatchdog(watchdog);
    closeTurn(turnId);
  }
}

export type { TurnPart };
