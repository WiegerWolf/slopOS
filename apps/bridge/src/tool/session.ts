import { CONTRACT_VERSIONS, listCoreSurfaceDescriptors, listToolDescriptors } from "@slopos/runtime";
import { getHistoryDiagnostics, getHistoryFilePath } from "../session/history";
import { getTurnDiagnostics } from "../session/store";
import { getSloposSession, listSloposSessions } from "../slopos-session-store";
import type { ToolDefinition } from "./types";

export const sloposSessionSnapshotTool: ToolDefinition = {
  name: "slopos_session_snapshot",
  async execute(input, context) {
    const sessionKey = typeof input.args?.sessionKey === "string" ? input.args.sessionKey : undefined;
    return {
      ok: true,
      output: sessionKey
        ? {
            sessionKey,
            session: getSloposSession(sessionKey) ?? null
          }
        : {
            sessions: listSloposSessions()
          },
      events: context.eventState
    };
  }
};

export const sloposRuntimeDiagnosticsTool: ToolDefinition = {
  name: "slopos_runtime_diagnostics",
  async execute(input, context) {
    const sessionKey = typeof input.args?.sessionKey === "string" ? input.args.sessionKey : undefined;

    return {
      ok: true,
      output: {
        versions: {
          protocol: CONTRACT_VERSIONS.bridgeProtocol,
          bridgeHistory: CONTRACT_VERSIONS.bridgeHistory,
          shellState: CONTRACT_VERSIONS.shellState,
          coreSurfaces: CONTRACT_VERSIONS.coreSurfaces,
          coreTools: CONTRACT_VERSIONS.coreTools,
          turnParts: CONTRACT_VERSIONS.turnParts
        },
        history: {
          filePath: getHistoryFilePath(),
          ...getHistoryDiagnostics()
        },
        turns: getTurnDiagnostics(),
        sessions: {
          requestedSession: sessionKey ?? null,
          sessionCount: listSloposSessions().length,
          currentSession: sessionKey ? getSloposSession(sessionKey) ?? null : null
        },
        registry: {
          tools: listToolDescriptors().map((tool) => ({
            id: tool.id,
            safety: tool.safety,
            mayRequireConfirmation: tool.mayRequireConfirmation ?? false
          })),
          surfaces: listCoreSurfaceDescriptors().map((surface) => ({
            id: surface.id,
            refreshTool: surface.refreshTool ?? null,
            capabilities: surface.capabilities
          }))
        }
      },
      events: context.eventState
    };
  }
};
