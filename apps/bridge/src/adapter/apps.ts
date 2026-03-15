import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

export type DesktopApp = {
  id: string;
  name: string;
  exec: string;
  icon?: string;
  categories?: string[];
};

type LaunchedProcess = {
  pid: number;
  command: string;
  startedAt: number;
  alive: boolean;
};

const launchedProcesses = new Map<string, LaunchedProcess>();

export function trackLaunchedProcess(id: string, pid: number, command: string) {
  launchedProcesses.set(id, { pid, command, startedAt: Date.now(), alive: true });
}

export function getLaunchedProcesses(): Array<LaunchedProcess & { id: string }> {
  const result: Array<LaunchedProcess & { id: string }> = [];

  for (const [id, proc] of launchedProcesses) {
    // Check liveness
    try {
      process.kill(proc.pid, 0);
      proc.alive = true;
    } catch {
      proc.alive = false;
    }
    result.push({ id, ...proc });
  }

  return result;
}

const XDG_DATA_DIRS = [
  "/usr/share/applications",
  "/usr/local/share/applications",
  `${process.env.HOME}/.local/share/applications`
];

export async function listDesktopApps(): Promise<DesktopApp[]> {
  const apps: DesktopApp[] = [];
  const seen = new Set<string>();

  for (const dir of XDG_DATA_DIRS) {
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (!entry.endsWith(".desktop") || seen.has(entry)) continue;
        seen.add(entry);

        try {
          const content = await readFile(join(dir, entry), "utf8");
          const name = content.match(/^Name=(.+)$/m)?.[1];
          const exec = content.match(/^Exec=(.+)$/m)?.[1];
          const icon = content.match(/^Icon=(.+)$/m)?.[1];
          const categories = content.match(/^Categories=(.+)$/m)?.[1]?.split(";").filter(Boolean);
          const noDisplay = content.match(/^NoDisplay=(.+)$/m)?.[1];

          if (!name || !exec || noDisplay === "true") continue;

          apps.push({
            id: entry.replace(".desktop", ""),
            name,
            exec: exec.replace(/%[fFuUdDnNickvm]/g, "").trim(),
            icon,
            categories
          });
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      // skip missing directories
    }
  }

  return apps.sort((a, b) => a.name.localeCompare(b.name));
}
