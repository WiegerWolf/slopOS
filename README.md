# slopOS Prototype

A prototype for an AI-operated Linux desktop: prompt-first, command-driven, and built around turning user intent into temporary UI, tool calls, and persistent artifacts.

This is not a distro. It is an experiment in what a desktop feels like when the primary interaction model is:

- describe what you want
- let an agent plan and act
- keep the useful artifacts
- discard the scaffolding

## What it does

slopOS combines:
- a React shell with prompt, canvas, chronicle, and generated surfaces
- a Bun bridge for planning, tool execution, and runtime UI generation
- host APIs for generated interfaces to interact with the local machine
- persistent task/artifact state so useful work survives beyond a single prompt

## Workspace

- `apps/shell` - React shell prototype with prompt, chronicle, canvas, and generated surfaces
- `apps/bridge` - Bun bridge for intent planning, tool calls, event state, and runtime TSX writes
- `packages/pilot-host` - host API and React hooks for generated surfaces
- `packages/pilot-runtime` - task, artifact, chronicle, and agent operation contracts
- `packages/pilot-ui` - minimal UI kit for hand-written and generated surfaces
- `docs/build-plan.md` - short build order and next milestones

## Run

1. Install Bun if needed.
2. Run `~/.bun/bin/bun install`
3. Run `~/.bun/bin/bun run dev`

This starts:

- the Bun bridge on `http://127.0.0.1:8787`
- the React shell on `http://localhost:5173`

Optional cloud planner env vars:

- `OPENAI_API_KEY` - enables cloud planning
- `OPENAI_BASE_URL` - defaults to `https://api.openai.com/v1`
- `OPENAI_MODEL` or `PILOT_MODEL` - defaults to `gpt-5.4`
- `PILOT_PLANNER_MODE` - `auto` (default), `cloud`, or `heuristic`

## Current state

This repo now includes a small Bun bridge that plans intents, accepts tool calls, exposes event state, and can overwrite a generated runtime surface. The shell still uses mocked system behavior, but the submit -> plan -> execute loop now crosses a real local API boundary.

The shell also includes an in-UI action inspector so you can watch intents, operations, tool calls, and task completion without dropping to the terminal.

The terminal artifact now renders through `xterm.js`, so PTY sessions feel like a real shell instead of a plain text dump.

The terminal surface is also lazy-loaded, so the heavy terminal bundle only lands when a terminal artifact is actually opened.

Terminal output now streams over a lightweight bridge endpoint instead of polling snapshots, so shell updates land on the canvas much faster.

The bridge currently supports these direct host tools:

- `shell_exec`
- `pty_open`
- `pty_write`
- `pty_snapshot`
- `pty_close`
- `fs_read`
- `fs_write`
- `app_launch`
- `browser_open`
- `system_control` for mocked Bluetooth pairing state

Planner behavior:

- without `OPENAI_API_KEY`, the bridge falls back to local heuristics
- with `OPENAI_API_KEY`, the bridge asks a cloud model for a structured planner spec and converts it into runtime operations
- if cloud planning fails in `auto` mode, it falls back to heuristics
- the shell sends current artifacts, active tasks, chronicle entries, status text, and recent system event state with each intent so follow-up commands can be context-aware
- intents now run as streamed turns over SSE, so the shell can react to planner/tool/artifact parts incrementally instead of waiting for one final payload
- turns can now iterate across multiple planner/tool rounds with a loop cap, so the bridge can inspect, replan, inspect again, and only then materialize the final UI
- tool rounds are now expressed as direct tool-call steps in the turn loop instead of planner-side `preludeTools`, which matches a provider-native agent flow more closely
- the bridge now keeps recent user/planner/tool/summary history per shell session and feeds that history back into planning, so follow-up commands can recover prior work even when the current canvas is sparse
- that session history is persisted to `.slopos/bridge-history.json`, so continuity survives bridge restarts
- bridge tools are now split through a registry-backed runtime instead of one large conditional module, which makes the agent substrate easier to extend
- dangerous bridge tools can now advertise confirmation requirements, and the shell will prompt before executing those actions from UI-triggered tool calls
- tool registry entries now carry safety classes (`read_only`, `stateful`, `destructive`), and that metadata is surfaced to the planner so the model can reason more clearly about risk
- confirmation can now pause a streamed turn mid-flight, wait for a user response, and then resume the same turn instead of falling back immediately to an explanatory surface
- those confirmation pauses now render inside the slopOS canvas instead of using browser modal dialogs
- confirmation requests and their outcomes now also show up in the shell's Chronicle rail, so approval history stays visible after the overlay closes
- shell-side UI state now persists in browser storage, so tasks, artifacts, Chronicle entries, action history, and confirmation history survive a shell reload
- terminal artifacts now persist their PTY ids and try to reattach after a shell reload instead of always spawning a fresh session
- persisted surface artifacts now carry restore metadata, and long-lived workspace surfaces can render themselves as restored when they rehydrate from shell storage
- slopOS now has a first-class embedded browser artifact, so browser-oriented tasks can stay inside the canvas and participate in the same persistence/rehydration model
- browser artifacts now keep lightweight session state (tabs, current URL, session summary) so follow-up planning can reason about the current browser workspace too
- the shell now syncs embedded browser session snapshots back to the bridge, and the agent can inspect them through a bridge-side browser session observation tool
- runtime summary surfaces now support structured badges, fact grids, and sections, so agent-generated summaries can render readable UI instead of dumping raw JSON blobs
- those structured summary surfaces now sit on reusable `@slopos/ui` summary components instead of inline style blocks, which makes future generated summaries more consistent
- slopOS session inspection is now available as a persistent dedicated surface, not just a one-off generated summary card
- browser session inspection is now available as a persistent dedicated surface too, so browser workspace state can stay live on screen instead of only rendering as a static summary
- built-in slopOS inspector/workspace surfaces now register through a small core surface layer with explicit capabilities and refresh hooks, which is the start of an internal surface platform
- the bridge now has matching core surface descriptors, so planners can target built-in surfaces intentionally instead of relying only on string-matched heuristics
- those core surface descriptors now come from a shared runtime package source, so shell and bridge surface metadata stay aligned
- tool descriptions, safety classes, and confirmation hints are now moving through the same shared-runtime style contract, so planner-visible tool metadata and bridge execution metadata stay aligned too
- shared runtime contracts are now explicitly versioned, and both bridge history persistence and shell-local persistence carry version metadata so future format changes can migrate more safely
- bridge history and shell-local state now load through explicit migration helpers, so older persisted formats can be upgraded instead of only being treated as ad hoc legacy blobs
- live shell/bridge protocol payloads now also carry a protocol version, so streamed turns and sync endpoints can evolve more deliberately too
- the shell now treats protocol mismatches as explicit compatibility failures, and the bridge returns versioned mismatch responses instead of failing implicitly
- slopOS now has a persistent diagnostics surface, so protocol versions, bridge health, turn activity, and registry state can be inspected inside the canvas instead of only through overlays and logs
- browser observation is now richer too: the bridge can inspect the focused browser tab or a specific browser workspace, not just dump the whole session snapshot
- slopOS can now sync a lightweight visible-page preview from embedded browser tabs when the page is capturable, and the bridge can query that through a dedicated page snapshot tool
- the bridge can now also steer embedded browser workspaces by queueing navigation commands into the current browser surface, so browser interaction is no longer observation-only
- browser control is now push-based too: embedded browser artifacts subscribe to bridge command streams instead of polling for queued commands
- browser observation is now eventful too: page-state changes can be pushed back to the bridge as lightweight browser events, and the agent can inspect recent browser activity instead of only static snapshots
- the browser inspector can now stay live by subscribing to the browser event stream, so recent page/title/preview changes show up without waiting for a manual refresh
- slopOS session and diagnostics surfaces now have the same live-stream pattern too, so shell-state changes can flow into inspectors without relying only on manual refresh buttons
