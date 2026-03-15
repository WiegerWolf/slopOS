# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is slopOS

A command-first shell prototype for an AI-operated Linux desktop. A prompt-first invocation surface where a single command materializes temporary UI, generated TSX surfaces call host tools directly, and useful artifacts persist while scaffolding disappears into the Chronicle.

## Commands

```bash
# Install dependencies (uses Bun, not npm/yarn)
~/.bun/bin/bun install

# Run both bridge + shell concurrently
~/.bun/bin/bun run dev
# Bridge: http://127.0.0.1:8787
# Shell:  http://localhost:5173 (proxies /api/* to bridge)

# Run individually
bun run --cwd apps/bridge dev
bun run --cwd apps/shell dev

# Build & typecheck
bun run build
bun run typecheck
```

No test framework is configured yet. No linter is configured.

## Architecture

**Monorepo layout** (Bun workspaces):

- `apps/shell/` — React + Vite frontend. The prompt UI, surface renderer, chronicle, and terminal emulator (xterm.js).
- `apps/bridge/` — Bun backend. Runs the agent turn loop, tool execution, LLM planner integration, and SSE streaming.
- `packages/pilot-runtime/` (`@slopos/runtime`) — Shared type contracts: Task, Artifact, ChronicleEntry, TurnPart, ToolDescriptor, CoreSurfaceId, CONTRACT_VERSIONS.
- `packages/pilot-host/` (`@slopos/host`) — React hooks (`useHost`, `useEvent`, `useSurfaceContext`) for generated surfaces to call tools and manage state.
- `packages/pilot-ui/` (`@slopos/ui`) — Minimal inline-styled component kit (Screen, Card, Button, PromptBox, etc.).

### Agent turn loop (`apps/bridge/src/session/loop.ts`)

`beginTurn()` → `runTurn()` loops up to MAX_PLANNER_ITERATIONS:
1. Build planning context from session history
2. Call cloud planner (OpenAI-compatible API) or heuristic fallback
3. Execute tool calls via the tool registry
4. Append results to history, emit TurnParts over SSE
5. Handle confirmation pauses (non-blocking — stream suspends, resumes on user response)

### Tool system (`apps/bridge/src/tool/`)

Tools are registered in `registry.ts`. Each tool has a safety class (`read_only`, `stateful`, `destructive`) from `@slopos/runtime`. Categories: shell/PTY, filesystem, browser, system, introspection.

### Streaming protocol (Bridge ↔ Shell)

- `POST /api/turns` — start a turn, returns turnId
- `GET /api/turns/:turnId/stream` — SSE stream of `TurnStreamEnvelope` (versioned)
- `POST /api/turns/:turnId/confirm` — respond to confirmation requests
- `POST /api/tools` — direct tool execution

TurnPart types: `turn_start`, `planner`, `operation`, `tool_call`, `tool_result`, `confirmation_request`, `confirmation_result`, `turn_error`, `turn_complete`.

### Surface system

**Core surfaces** are pre-built React components referenced by `CoreSurfaceId` enum (terminal, browser-inspector, session-inspector, diagnostics-inspector, coding-workspace, etc.).

**Generated surfaces** are TSX modules written by the planner to `apps/shell/generated/`, dynamically imported and mounted. They use `@slopos/host` hooks to interact with the bridge.

### Data model

- **Task** — has intent, status, artifacts[], plan, logs
- **Artifact** — has type (surface|browser|terminal|file|note), retention (ephemeral|collapsed|persistent|pinned|background), visibility state
- **Chronicle** — compresses finished tasks with their visible/collapsed artifacts

### LLM planner (`apps/bridge/src/llm.ts`)

Defaults to heuristic fallback (no API key needed). Set `OPENAI_API_KEY` for cloud planning. Supports `OPENAI_BASE_URL`, `OPENAI_MODEL`/`PILOT_MODEL`, and `PILOT_PLANNER_MODE` (auto|cloud|heuristic).

## Key conventions

- All protocol endpoints check `protocolVersion` from `CONTRACT_VERSIONS` — mismatches return 409
- Shell state persists to localStorage (artifacts, chronicle, tasks, confirmations)
- TypeScript strict mode, target ES2022
- Bun runtime everywhere (not Node)
