import { dbInsertAudit } from "../db";

export type AuditEntry = {
  timestamp: number;
  turnId?: string;
  taskId?: string;
  action: string;
  tool?: string;
  detail?: string;
};

export function appendAuditEntry(entry: AuditEntry) {
  dbInsertAudit(
    entry.timestamp,
    entry.turnId ?? null,
    entry.taskId ?? null,
    entry.action,
    entry.tool ?? null,
    entry.detail ?? null
  );
}
