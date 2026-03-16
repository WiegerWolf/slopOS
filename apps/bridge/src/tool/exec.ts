import { streamToText } from "./shared";

export type ExecResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  pid?: number;
};

// Track background processes so surfaces can kill them later
const backgroundProcs = new Map<number, { proc: ReturnType<typeof Bun.spawn>; cmd: string; startedAt: number }>();

export function killBackgroundProc(pid: number): boolean {
  const entry = backgroundProcs.get(pid);
  if (!entry) {
    // Try system kill as fallback
    try { process.kill(pid, "SIGTERM"); return true; } catch { return false; }
  }
  try {
    entry.proc.kill();
    backgroundProcs.delete(pid);
    return true;
  } catch {
    return false;
  }
}

export function listBackgroundProcs() {
  return [...backgroundProcs.entries()].map(([pid, entry]) => ({
    pid,
    cmd: entry.cmd,
    startedAt: entry.startedAt
  }));
}

export async function execCommand(
  cmd: string,
  opts?: { asRoot?: boolean; cwd?: string; timeoutMs?: number; background?: boolean }
): Promise<ExecResult> {
  const finalCmd = opts?.asRoot
    ? `pkexec sh -c ${JSON.stringify(cmd)}`
    : cmd;

  const proc = Bun.spawn(["sh", "-lc", finalCmd], {
    cwd: opts?.cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

  // Background mode: return immediately with PID
  if (opts?.background) {
    const pid = proc.pid;
    backgroundProcs.set(pid, { proc, cmd, startedAt: Date.now() });

    // Auto-cleanup when process exits
    void proc.exited.then(() => { backgroundProcs.delete(pid); });

    // Wait briefly to catch immediate startup failures
    const raceResult = await Promise.race([
      proc.exited.then((code) => ({ exited: true as const, code })),
      new Promise<{ exited: false }>((resolve) => setTimeout(() => resolve({ exited: false }), 500))
    ]);

    if (raceResult.exited) {
      backgroundProcs.delete(pid);
      const [stdout, stderr] = await Promise.all([
        streamToText(proc.stdout),
        streamToText(proc.stderr)
      ]);
      return {
        ok: raceResult.code === 0,
        exitCode: raceResult.code,
        stdout,
        stderr,
        timedOut: false
      };
    }

    return {
      ok: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      timedOut: false,
      pid
    };
  }

  // Normal mode: wait for exit with timeout
  const timeoutMs = opts?.timeoutMs ?? 30000;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  const exitCode = await proc.exited;
  clearTimeout(timeout);

  const [stdout, stderr] = await Promise.all([
    streamToText(proc.stdout),
    streamToText(proc.stderr)
  ]);

  return {
    ok: !timedOut && exitCode === 0,
    exitCode,
    stdout,
    stderr,
    timedOut
  };
}
