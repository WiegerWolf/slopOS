import type { ToolDefinition } from "./types";

type TerminalSession = {
  id: string;
  proc: ReturnType<typeof Bun.spawn>;
  buffer: string;
  closed: boolean;
  exitCode: number | null;
};

export type TerminalSnapshot = {
  ptyId: string;
  buffer: string;
  closed: boolean;
  exitCode: number | null;
};

const terminalSessions = new Map<string, TerminalSession>();

async function pumpStream(stream: ReadableStream<Uint8Array> | null, onChunk: (chunk: string) => void) {
  if (!stream) {
    return;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        const tail = decoder.decode();
        if (tail) {
          onChunk(tail);
        }
        break;
      }

      onChunk(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

function appendToSession(session: TerminalSession, chunk: string) {
  session.buffer = `${session.buffer}${chunk}`.slice(-16000);
}

async function createTerminalSession(command?: string, cwd?: string) {
  const proc = Bun.spawn(["sh"], {
    cwd,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe"
  });

  const session: TerminalSession = {
    id: crypto.randomUUID(),
    proc,
    buffer: "",
    closed: false,
    exitCode: null
  };

  terminalSessions.set(session.id, session);

  void pumpStream(proc.stdout, (chunk) => appendToSession(session, chunk));
  void pumpStream(proc.stderr, (chunk) => appendToSession(session, chunk));
  void proc.exited.then((exitCode) => {
    session.closed = true;
    session.exitCode = exitCode;
    appendToSession(session, `\n[process exited ${exitCode}]\n`);
  });

  if (command) {
    session.proc.stdin.write(`${command}\n`);
  }

  return session;
}

function getSession(id: string) {
  return terminalSessions.get(id);
}

export function getTerminalSnapshot(ptyId: string): TerminalSnapshot | null {
  const session = getSession(ptyId);
  if (!session) {
    return null;
  }

  return {
    ptyId,
    buffer: session.buffer,
    closed: session.closed,
    exitCode: session.exitCode
  };
}

export const ptyOpenTool: ToolDefinition = {
  name: "pty_open",
  async execute(input, context) {
    const command = typeof input.args?.command === "string" ? input.args.command : undefined;
    const cwd = typeof input.args?.cwd === "string" ? input.args.cwd : undefined;
    const session = await createTerminalSession(command, cwd);
    return {
      ok: true,
      output: getTerminalSnapshot(session.id),
      events: context.eventState
    };
  }
};

export const ptyWriteTool: ToolDefinition = {
  name: "pty_write",
  async execute(input, context) {
    const ptyId = String(input.args?.ptyId ?? "");
    const text = String(input.args?.input ?? "");
    const session = getSession(ptyId);
    if (!session) {
      return { ok: false, error: `unknown pty session ${ptyId}`, events: context.eventState };
    }

    session.proc.stdin.write(text);
    return {
      ok: true,
      output: { ptyId, written: text.length, closed: session.closed },
      events: context.eventState
    };
  }
};

export const ptySnapshotTool: ToolDefinition = {
  name: "pty_snapshot",
  async execute(input, context) {
    const ptyId = String(input.args?.ptyId ?? "");
    const snapshot = getTerminalSnapshot(ptyId);
    if (!snapshot) {
      return { ok: false, error: `unknown pty session ${ptyId}`, events: context.eventState };
    }

    return {
      ok: true,
      output: snapshot,
      events: context.eventState
    };
  }
};

export const ptyCloseTool: ToolDefinition = {
  name: "pty_close",
  async execute(input, context) {
    const ptyId = String(input.args?.ptyId ?? "");
    const session = getSession(ptyId);
    if (!session) {
      return { ok: false, error: `unknown pty session ${ptyId}`, events: context.eventState };
    }

    session.proc.kill();
    session.closed = true;
    terminalSessions.delete(ptyId);
    return {
      ok: true,
      output: { ptyId, closed: true },
      events: context.eventState
    };
  }
};
