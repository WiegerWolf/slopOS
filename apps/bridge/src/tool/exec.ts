import { streamToText } from "./shared";

export type ExecResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

export async function execCommand(
  cmd: string,
  opts?: { asRoot?: boolean; cwd?: string; timeoutMs?: number }
): Promise<ExecResult> {
  const timeoutMs = opts?.timeoutMs ?? 30000;
  const finalCmd = opts?.asRoot
    ? `pkexec sh -c ${JSON.stringify(cmd)}`
    : cmd;

  const proc = Bun.spawn(["sh", "-lc", finalCmd], {
    cwd: opts?.cwd,
    stdout: "pipe",
    stderr: "pipe"
  });

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
