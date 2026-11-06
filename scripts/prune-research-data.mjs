import { createHash, randomUUID } from 'node:crypto';
import { chmod, open, readFile, readdir, rename, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const digest = /^[a-f0-9]{64}$/;
const terminal = new Set(['completed', 'failed', 'cancelled']);
const active = new Set(['pending', 'in_progress', 'cancel_requested']);
const [ledger, documents, rawDays, flag, ...extra] = process.argv.slice(2);
const days = Number(rawDays);
const apply = flag === '--apply';
if (!ledger || !documents || !Number.isSafeInteger(days) || days < 1 || days > 3650 || (flag && !apply) || extra.length) {
  console.error('Usage: node scripts/prune-research-data.mjs <tasks.json> <documents-directory> <retention-days> [--apply]');
  process.exit(1);
}

const cutoff = Date.now() - days * 86_400_000;
const sqliteFilename = ledger + '.sqlite';
const exists = file => stat(file).then(() => true, error => {
  if (error.code === 'ENOENT') return false;
  throw error;
});
const directoryEntries = directory => readdir(directory, { withFileTypes: true }).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
const hashWorkspace = id => createHash('sha256').update(id).digest('hex');
let lock;
let database;

async function updateJson(tasks) {
  const temporary = ledger + '.' + randomUUID() + '.tmp';
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(JSON.stringify(tasks, null, 2));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, ledger);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  const directory = await open(path.dirname(ledger), 'r');
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

async function expiredFiles(directory, suffixes, retained) {
  const files = [];
  for (const entry of await directoryEntries(directory)) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name);
    const id = path.basename(entry.name, extension);
    if (!suffixes.has(extension) || !digest.test(id) || retained.has(id)) continue;
    const filename = path.join(directory, entry.name);
    if ((await stat(filename)).mtimeMs < cutoff) files.push(filename);
  }
  return files;
}

try {
  if (apply) {
    const lockFilename = ledger + '.lock.sqlite';
    await (await open(lockFilename, 'a', 0o600)).close();
    await chmod(lockFilename, 0o600);
    lock = new DatabaseSync(lockFilename);
    lock.exec('BEGIN IMMEDIATE');
  }
  if (await exists(sqliteFilename)) {
    database = new DatabaseSync(sqliteFilename, { readOnly: !apply });
    if (!database.prepare("SELECT 1 FROM dgr_ledger WHERE key = 'v1-imported'").get()) {
      throw new Error('SQLite import is incomplete');
    }
  }
  const tasks = database
    ? database.prepare('SELECT id, payload FROM dgr_tasks').all().map(row => {
        const task = JSON.parse(row.payload);
        if (row.id !== task.id) throw new Error('Inconsistent SQLite task identity');
        return task;
      })
    : JSON.parse(await readFile(ledger, 'utf8'));
  if (!Array.isArray(tasks)) throw new Error('Invalid ledger');
  const ids = new Set();
  const resultRefs = new Set();
  const documentRefs = new Map();
  const kept = [];
  const expired = [];
  for (const task of tasks) {
    if (!task?.id || typeof task.id !== 'string' || ids.has(task.id) || !task.parameters
      || (!terminal.has(task.status) && !active.has(task.status))
      || !Number.isFinite(Date.parse(task.updatedAt))) throw new Error('Invalid task record');
    ids.add(task.id);
    if (terminal.has(task.status) && Date.parse(task.updatedAt) < cutoff) {
      expired.push(task.id);
      continue;
    }
    kept.push(task);
    if (task.resultSha256 !== undefined) {
      if (!digest.test(task.resultSha256)) throw new Error('Invalid result reference');
      resultRefs.add(task.resultSha256);
    }
    const scope = task.workspaceId === undefined ? '' : hashWorkspace(task.workspaceId);
    const refs = documentRefs.get(scope) ?? new Set();
    for (const id of task.parameters.userDocumentIds ?? []) {
      if (typeof id !== 'string' || !/^sha256:[a-f0-9]{64}$/i.test(id)) throw new Error('Invalid PDF reference');
      refs.add(id.slice(7).toLowerCase());
    }
    documentRefs.set(scope, refs);
  }
  const resultFiles = await expiredFiles(path.join(path.dirname(ledger), 'research-results'), new Set(['.json']), resultRefs);
  const pdfExtensions = new Set(['.json', '.pdf']);
  const pdfFiles = await expiredFiles(documents, pdfExtensions, documentRefs.get('') ?? new Set());
  const workspaces = path.join(documents, 'workspaces');
  for (const workspace of await directoryEntries(workspaces)) {
    if (workspace.isDirectory() && digest.test(workspace.name)) {
      const files = await expiredFiles(path.join(workspaces, workspace.name), pdfExtensions, documentRefs.get(workspace.name) ?? new Set());
      for (const file of files) pdfFiles.push(file);
    }
  }
  if (apply) {
    if (database && expired.length) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const remove = database.prepare('DELETE FROM dgr_tasks WHERE id = ?');
        for (const id of expired) remove.run(id);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    } else if (expired.length) {
      await updateJson(kept);
    }
    for (const file of [...resultFiles, ...pdfFiles]) await unlink(file);
  }
  console.log(JSON.stringify({ applied: apply, expiredTasks: expired.length, resultFiles: resultFiles.length, documentFiles: pdfFiles.length }));
} catch {
  console.error('Retention failed. Check the ledger and paths, and stop the active DGR worker before applying.');
  process.exitCode = 1;
} finally {
  database?.close();
  lock?.close();
}
