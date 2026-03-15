import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";

const SLOPOS_DIR = join(process.env.HOME ?? "/tmp", ".slopos");
const DB_PATH = join(SLOPOS_DIR, "slopos.db");

const SCHEMA_VERSION = 1;

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    throw new Error("database not initialized — call initDb() first");
  }
  return _db;
}

export function initDb() {
  mkdirSync(SLOPOS_DIR, { recursive: true });

  _db = new Database(DB_PATH);
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA synchronous = NORMAL");
  _db.exec("PRAGMA foreign_keys = ON");

  migrate(_db);
  recoverIncompleteTurns(_db);
  migrateJsonHistory(_db);
  migrateJsonlAudit(_db);

  console.log(`slopOS database opened at ${DB_PATH}`);
}

// ---------------------------------------------------------------------------
// Schema migration
// ---------------------------------------------------------------------------

function migrate(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  const row = db.query<{ value: string }, []>(
    "SELECT value FROM schema_meta WHERE key = 'version'"
  ).get();

  const currentVersion = row ? Number(row.value) : 0;

  if (currentVersion >= SCHEMA_VERSION) return;

  db.transaction(() => {
    if (currentVersion < 1) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS turns (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          session_key TEXT NOT NULL DEFAULT 'default',
          created_at INTEGER NOT NULL,
          closed INTEGER NOT NULL DEFAULT 0,
          task_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_key);
        CREATE INDEX IF NOT EXISTS idx_turns_created ON turns(created_at);

        CREATE TABLE IF NOT EXISTS turn_parts (
          id TEXT PRIMARY KEY,
          turn_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          data_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_parts_turn ON turn_parts(turn_id, seq);

        CREATE TABLE IF NOT EXISTS history (
          rowid INTEGER PRIMARY KEY AUTOINCREMENT,
          session_key TEXT NOT NULL,
          kind TEXT NOT NULL,
          task_id TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          data_json TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_history_session ON history(session_key, rowid);

        CREATE TABLE IF NOT EXISTS audit (
          rowid INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp INTEGER NOT NULL,
          turn_id TEXT,
          task_id TEXT,
          action TEXT NOT NULL,
          tool TEXT,
          detail TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_audit_turn ON audit(turn_id);
        CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit(timestamp);
      `);
    }

    db.exec(
      `INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '${SCHEMA_VERSION}')`
    );
  })();
}

// ---------------------------------------------------------------------------
// Startup recovery: mark unclosed turns as failed
// ---------------------------------------------------------------------------

function recoverIncompleteTurns(db: Database) {
  const unclosed = db.query<{ id: string; task_id: string }, []>(
    "SELECT id, task_id FROM turns WHERE closed = 0"
  ).all();

  if (unclosed.length === 0) return;

  const insertPart = db.prepare<void, [string, string, number, string]>(
    "INSERT INTO turn_parts (id, turn_id, seq, data_json) VALUES (?, ?, ?, ?)"
  );
  const closeTurn = db.prepare<void, [string]>(
    "UPDATE turns SET closed = 1 WHERE id = ?"
  );

  db.transaction(() => {
    for (const turn of unclosed) {
      const maxSeq = db.query<{ m: number | null }, [string]>(
        "SELECT MAX(seq) as m FROM turn_parts WHERE turn_id = ?"
      ).get(turn.id);
      const nextSeq = (maxSeq?.m ?? -1) + 1;

      const errorPart = {
        id: crypto.randomUUID(),
        turnId: turn.id,
        taskId: turn.task_id,
        timestamp: Date.now(),
        kind: "turn_error" as const,
        message: "bridge restarted — turn was interrupted"
      };

      insertPart.run(errorPart.id, turn.id, nextSeq, JSON.stringify(errorPart));
      closeTurn.run(turn.id);
    }
  })();

  console.log(`recovered ${unclosed.length} incomplete turn(s) from previous session`);
}

// ---------------------------------------------------------------------------
// One-time migration: bridge-history.json → SQLite
// ---------------------------------------------------------------------------

function migrateJsonHistory(db: Database) {
  const migrated = db.query<{ value: string }, []>(
    "SELECT value FROM schema_meta WHERE key = 'history_migrated'"
  ).get();
  if (migrated) return;

  const historyFile = join(SLOPOS_DIR, "bridge-history.json");
  const legacyFile = join(process.cwd(), ".slopos", "bridge-history.json");
  // The old history module hard-coded the workspace root
  const workspaceLegacyFile = join("/home/n/slopos", ".slopos", "bridge-history.json");

  let filePath: string | null = null;
  if (existsSync(historyFile)) filePath = historyFile;
  else if (existsSync(workspaceLegacyFile)) filePath = workspaceLegacyFile;
  else if (existsSync(legacyFile)) filePath = legacyFile;

  if (filePath) {
    try {
      const raw = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      const sessions: Record<string, unknown[]> =
        parsed.sessions ?? (parsed.version ? {} : parsed);

      const insert = db.prepare<void, [string, string, string, number, string]>(
        "INSERT INTO history (session_key, kind, task_id, timestamp, data_json) VALUES (?, ?, ?, ?, ?)"
      );

      db.transaction(() => {
        for (const [sessionKey, records] of Object.entries(sessions)) {
          if (!Array.isArray(records)) continue;
          for (const record of records) {
            const r = record as { kind?: string; taskId?: string; timestamp?: number };
            insert.run(
              sessionKey,
              r.kind ?? "unknown",
              r.taskId ?? "",
              r.timestamp ?? 0,
              JSON.stringify(record)
            );
          }
        }
      })();

      renameSync(filePath, `${filePath}.migrated`);
      console.log(`migrated history from ${filePath}`);
    } catch (err) {
      console.warn("history migration failed (non-fatal):", err);
    }
  }

  db.exec("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('history_migrated', '1')");
}

// ---------------------------------------------------------------------------
// One-time migration: audit.jsonl → SQLite
// ---------------------------------------------------------------------------

function migrateJsonlAudit(db: Database) {
  const migrated = db.query<{ value: string }, []>(
    "SELECT value FROM schema_meta WHERE key = 'audit_migrated'"
  ).get();
  if (migrated) return;

  const auditFile = join(SLOPOS_DIR, "audit.jsonl");

  if (existsSync(auditFile)) {
    try {
      const raw = readFileSync(auditFile, "utf8");
      const lines = raw.split("\n").filter((l) => l.trim());

      const insert = db.prepare<void, [number, string | null, string | null, string, string | null, string | null]>(
        "INSERT INTO audit (timestamp, turn_id, task_id, action, tool, detail) VALUES (?, ?, ?, ?, ?, ?)"
      );

      db.transaction(() => {
        for (const line of lines) {
          try {
            const entry = JSON.parse(line) as {
              timestamp?: number;
              turnId?: string;
              taskId?: string;
              action?: string;
              tool?: string;
              detail?: string;
            };
            insert.run(
              entry.timestamp ?? 0,
              entry.turnId ?? null,
              entry.taskId ?? null,
              entry.action ?? "unknown",
              entry.tool ?? null,
              entry.detail ?? null
            );
          } catch {
            // skip malformed lines
          }
        }
      })();

      renameSync(auditFile, `${auditFile}.migrated`);
      console.log(`migrated audit from ${auditFile}`);
    } catch (err) {
      console.warn("audit migration failed (non-fatal):", err);
    }
  }

  db.exec("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('audit_migrated', '1')");
}

// ---------------------------------------------------------------------------
// Prepared statement accessors (turn store)
// ---------------------------------------------------------------------------

export function dbInsertTurn(id: string, taskId: string, sessionKey: string, createdAt: number, taskJson: string) {
  getDb().prepare<void, [string, string, string, number, string]>(
    "INSERT INTO turns (id, task_id, session_key, created_at, task_json) VALUES (?, ?, ?, ?, ?)"
  ).run(id, taskId, sessionKey, createdAt, taskJson);
}

export function dbCloseTurn(id: string) {
  getDb().prepare<void, [string]>(
    "UPDATE turns SET closed = 1 WHERE id = ?"
  ).run(id);
}

export function dbInsertTurnPart(id: string, turnId: string, seq: number, dataJson: string) {
  getDb().prepare<void, [string, string, number, string]>(
    "INSERT INTO turn_parts (id, turn_id, seq, data_json) VALUES (?, ?, ?, ?)"
  ).run(id, turnId, seq, dataJson);
}

export function dbGetTurnParts(turnId: string) {
  return getDb().query<{ data_json: string }, [string]>(
    "SELECT data_json FROM turn_parts WHERE turn_id = ? ORDER BY seq"
  ).all(turnId).map((row) => JSON.parse(row.data_json));
}

export function dbGetTurn(id: string) {
  return getDb().query<{ id: string; task_id: string; session_key: string; created_at: number; closed: number; task_json: string }, [string]>(
    "SELECT * FROM turns WHERE id = ?"
  ).get(id);
}

export function dbGetRecentTurns(sessionKey: string, limit = 20) {
  return getDb().query<{ id: string; task_id: string; created_at: number; closed: number; task_json: string }, [string, number]>(
    "SELECT id, task_id, created_at, closed, task_json FROM turns WHERE session_key = ? ORDER BY created_at DESC LIMIT ?"
  ).all(sessionKey, limit);
}

// ---------------------------------------------------------------------------
// Prepared statement accessors (history)
// ---------------------------------------------------------------------------

export function dbInsertHistory(sessionKey: string, kind: string, taskId: string, timestamp: number, dataJson: string) {
  getDb().prepare<void, [string, string, string, number, string]>(
    "INSERT INTO history (session_key, kind, task_id, timestamp, data_json) VALUES (?, ?, ?, ?, ?)"
  ).run(sessionKey, kind, taskId, timestamp, dataJson);
}

export function dbGetRecentHistory(sessionKey: string, limit: number) {
  return getDb().query<{ data_json: string }, [string, number]>(
    "SELECT data_json FROM (SELECT data_json, rowid FROM history WHERE session_key = ? ORDER BY rowid DESC LIMIT ?) sub ORDER BY rowid ASC"
  ).all(sessionKey, limit).map((row) => JSON.parse(row.data_json));
}

export function dbGetHistoryCount(sessionKey: string) {
  const row = getDb().query<{ c: number }, [string]>(
    "SELECT COUNT(*) as c FROM history WHERE session_key = ?"
  ).get(sessionKey);
  return row?.c ?? 0;
}

export function dbPruneHistory(sessionKey: string, keepCount: number) {
  getDb().prepare<void, [string, string, number]>(
    "DELETE FROM history WHERE session_key = ? AND rowid NOT IN (SELECT rowid FROM history WHERE session_key = ? ORDER BY rowid DESC LIMIT ?)"
  ).run(sessionKey, sessionKey, keepCount);
}

// ---------------------------------------------------------------------------
// Prepared statement accessors (audit)
// ---------------------------------------------------------------------------

export function dbInsertAudit(
  timestamp: number,
  turnId: string | null,
  taskId: string | null,
  action: string,
  tool: string | null,
  detail: string | null
) {
  try {
    getDb().prepare<void, [number, string | null, string | null, string, string | null, string | null]>(
      "INSERT INTO audit (timestamp, turn_id, task_id, action, tool, detail) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(timestamp, turnId, taskId, action, tool, detail);
  } catch {
    // audit is best-effort; never crash the bridge
  }
}
