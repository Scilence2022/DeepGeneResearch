import { openSync, closeSync, chmodSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { GeneResearchTask } from '@/models/task';

export type StoredTask = GeneResearchTask & { resultSha256?: string };

function privateDatabase(filename: string) {
  closeSync(openSync(filename, 'a', 0o600));
  chmodSync(filename, 0o600);
  return new DatabaseSync(filename);
}

const key = Symbol.for('dgr.task-ledger-locks');
const processState = globalThis as typeof globalThis & { [key]?: Map<string, DatabaseSync> };
const locks = processState[key] ??= new Map();

export function acquireTaskLedgerLock(ledger: string) {
  if (locks.has(ledger)) return;
  const db = privateDatabase(ledger + '.lock.sqlite');
  try {
    // The OS releases the transaction on process exit, even after SIGKILL.
    db.exec('BEGIN IMMEDIATE');
    locks.set(ledger, db);
  } catch {
    db.close();
    throw new Error('Another DGR process already owns this task ledger');
  }
}

export class SqliteTaskLedger {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    this.db = privateDatabase(filename);
    this.db.exec(`
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS dgr_ledger (key TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS dgr_tasks (
        id TEXT PRIMARY KEY,
        workspace TEXT NOT NULL,
        idempotency_key TEXT,
        payload TEXT NOT NULL,
        UNIQUE(workspace, idempotency_key)
      );
    `);
  }

  read(): unknown[] | null {
    if (!this.db.prepare("SELECT 1 FROM dgr_ledger WHERE key = 'v1-imported'").get()) return null;
    return this.db.prepare('SELECT payload FROM dgr_tasks ORDER BY rowid').all().map(row => JSON.parse(String(row.payload)));
  }

  write(rows: StoredTask[], removedIds: string[], initialize: boolean) {
    const upsert = this.db.prepare(`
      INSERT INTO dgr_tasks (id, workspace, idempotency_key, payload) VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET workspace = excluded.workspace,
        idempotency_key = excluded.idempotency_key, payload = excluded.payload
    `);
    const remove = this.db.prepare('DELETE FROM dgr_tasks WHERE id = ?');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of removedIds) remove.run(id);
      for (const row of rows) upsert.run(row.id, row.workspaceId ?? '', row.parameters.idempotencyKey || null, JSON.stringify(row));
      if (initialize) this.db.exec("INSERT INTO dgr_ledger VALUES ('v1-imported')");
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
