# Build Plan

## Milestone 1 - prove the invocation loop

- centered prompt and wake-first shell
- top Chronicle that compresses finished commands
- task model with artifacts and retention
- generated TSX surface mounting
- mock host bridge and tool calls

## Milestone 2 - wire a real local runtime

- event bus for task and artifact updates
- real tool adapters for shell, PTY, and file IO
- confirmation surfaces and action log
- compile and retry loop for generated TSX

## Milestone 3 - machine control

- root-capable host bridge
- browser and terminal native panes
- system adapters for Bluetooth, audio, network, and apps
- recovery and panic flows

## Milestone 4 - shell to compositor transition

- keep the same task/artifact model
- move from fullscreen shell app toward compositor-managed shell surfaces
- preserve generated TSX surface runtime as the UI layer

# North star

So the final architecture is one binary:

  tauri binary
    ├── rust backend (bridge: agent loop, tools, LLM API, SQLite)
    ├── embedded static assets (the React shell, pre-built)
    └── swc (Rust-native TSX transpiler for generated surfaces at runtime)

  One process. No Bun. No Vite. No Node. Just a Rust binary that serves a webview and transpiles whatever
  the LLM comes up with on the fly using swc (which is already written in Rust).

  During development, you'd still use Vite dev server + cargo tauri dev — Tauri points the webview at
  localhost:5173 so you get hot reload. Normal Tauri workflow.

  During production (the actual bootable session), it's just the one binary. The shell is static assets
  embedded in it. Generated surfaces are the only dynamic part — LLM produces TSX, swc compiles to JS,
  webview imports it.

  That's the end state.