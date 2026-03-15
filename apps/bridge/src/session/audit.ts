import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export type AuditEntry = {
  timestamp: number;
  turnId?: string;
  taskId?: string;
  action: string;
  tool?: string;
  detail?: string;
};

const AUDIT_DIR = join(process.env.HOME ?? "/tmp", ".slopos");
const AUDIT_PATH = join(AUDIT_DIR, "audit.jsonl");

let initialized = false;

async function ensureDir() {
  if (initialized) return;
  await mkdir(AUDIT_DIR, { recursive: true });
  initialized = true;
}

export async function appendAuditEntry(entry: AuditEntry) {
  try {
    await ensureDir();
    await appendFile(AUDIT_PATH, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // audit is best-effort; never crash the bridge
  }
}
