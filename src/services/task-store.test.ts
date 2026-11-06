import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const originalVercel = process.env.VERCEL;
const originalCfPages = process.env.CF_PAGES;
const originalNodeEnv = process.env.NODE_ENV;
const originalWorkerCount = process.env.DGR_WORKER_COUNT;
const originalWebConcurrency = process.env.WEB_CONCURRENCY;
const mutableEnv = process.env as Record<string, string | undefined>;

describe.sequential('durable task store', () => {
  let directory: string;
  let storageFile: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'dgr-task-store-'));
    storageFile = path.join(directory, 'tasks.json');
    process.env.MCP_TASK_STORAGE_FILE = storageFile;
    delete process.env.VERCEL;
    delete process.env.CF_PAGES;
    delete process.env.DGR_WORKER_COUNT;
    delete process.env.WEB_CONCURRENCY;
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.MCP_TASK_STORAGE_FILE;
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
    if (originalCfPages === undefined) delete process.env.CF_PAGES;
    else process.env.CF_PAGES = originalCfPages;
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
    delete process.env.DGR_ALLOW_EPHEMERAL_TASK_STORAGE;
    vi.unstubAllEnvs();
    if (originalWorkerCount === undefined) delete process.env.DGR_WORKER_COUNT;
    else process.env.DGR_WORKER_COUNT = originalWorkerCount;
    if (originalWebConcurrency === undefined) delete process.env.WEB_CONCURRENCY;
    else process.env.WEB_CONCURRENCY = originalWebConcurrency;
    await rm(directory, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('atomically creates one task for concurrent identical idempotent requests', async () => {
    const { taskStore } = await import('./task-store');
    const parameters = {
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
      idempotencyKey: 'same-logical-run',
    };

    const results = await Promise.all(
      Array.from({ length: 12 }, () => taskStore.createOrGetTask(parameters))
    );

    expect(new Set(results.map(result => result.task.id)).size).toBe(1);
    expect(results.filter(result => result.created)).toHaveLength(1);
    expect(JSON.parse(await readFile(storageFile, 'utf8'))).toHaveLength(1);
    expect((await stat(storageFile)).mode & 0o777).toBe(0o600);
  });

  it('isolates identical idempotency keys and durable artifact lookups across workspaces', async () => {
    const { taskStore } = await import('./task-store');
    const parameters = { geneSymbol: 'thrL', organism: 'Escherichia coli', idempotencyKey: 'shared' };
    const alpha = (await taskStore.createOrGetTask(parameters, 100, 'alpha')).task;
    const beta = (await taskStore.createOrGetTask(parameters, 100, 'beta')).task;
    expect(alpha.id).not.toBe(beta.id);
    expect(await taskStore.listTasks(0, 10, false, 'alpha')).toMatchObject({ total: 1, tasks: [{ id: alpha.id }] });
    expect(await taskStore.getTaskByArtifactId(alpha.id, 'beta')).toBeNull();
    expect(await taskStore.getTaskByArtifactId(alpha.id)).toBeNull();

    vi.resetModules();
    const { taskStore: reopened } = await import('./task-store');
    expect((await reopened.createOrGetTask(parameters, 100, 'alpha')).task.id).toBe(alpha.id);
    expect((await reopened.createOrGetTask(parameters, 100, 'beta')).task.id).toBe(beta.id);
  });

  it('rejects reuse of an idempotency key for a different target', async () => {
    const { taskStore, IdempotencyConflictError } = await import('./task-store');
    await taskStore.createOrGetTask({
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
      idempotencyKey: 'target-key',
    });

    await expect(taskStore.createOrGetTask({
      geneSymbol: 'lacZ',
      organism: 'Escherichia coli',
      idempotencyKey: 'target-key',
    })).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it('deep-clones caller-owned parameters before storing them', async () => {
    const { taskStore } = await import('./task-store');
    const parameters = {
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
      researchFocus: ['function'],
    };
    const { task } = await taskStore.createOrGetTask(parameters);

    parameters.researchFocus[0] = 'mutated-after-create';
    expect((await taskStore.getTask(task.id))?.parameters).toMatchObject({ researchFocus: ['function'] });
    const persisted = JSON.parse(await readFile(storageFile, 'utf8'));
    expect(persisted[0].parameters.researchFocus).toEqual(['function']);
  });

  it('does not allow late progress or result writes to resurrect a cancelled task', async () => {
    const { taskStore } = await import('./task-store');
    const task = await taskStore.createTask({ geneSymbol: 'thrL', organism: 'Escherichia coli' });
    await taskStore.updateTaskStatus(task.id, 'in_progress', 50, 'research');
    await taskStore.requestCancellation(task.id);

    expect((await taskStore.updateTaskStatus(task.id, 'in_progress', 80, 'late-progress')).status)
      .toBe('cancel_requested');
    expect((await taskStore.updateTaskResult(task.id, { finalReport: 'late result' })).status)
      .toBe('cancel_requested');
    await taskStore.updateTaskStatus(task.id, 'cancelled', 50, 'cancelled');
    expect((await taskStore.updateTaskError(task.id, 'late error')).status).toBe('cancelled');
  });

  it('deep-clones a completed result before placing it in the durable cache', async () => {
    const { taskStore } = await import('./task-store');
    const task = await taskStore.createTask({ geneSymbol: 'thrL', organism: 'Escherichia coli' });
    await taskStore.updateTaskStatus(task.id, 'in_progress');
    const result = { finalReport: 'original report', sources: [{ url: 'https://example.org/source' }] };
    await taskStore.updateTaskResult(task.id, result);

    result.sources[0].url = 'https://attacker.invalid/mutated';
    expect((await taskStore.getTask(task.id))?.result.sources[0].url).toBe('https://example.org/source');
    const [stored] = JSON.parse(await readFile(storageFile, 'utf8'));
    expect(stored.resultSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.result).toBeUndefined();

    vi.resetModules();
    const { taskStore: reopened } = await import('./task-store');
    expect((await reopened.getTaskMetadata(task.id))?.result).toBeUndefined();
    expect((await reopened.getTask(task.id))?.result.finalReport).toBe('original report');

  });

  it('imports a JSON ledger with inline results into transactional SQLite and reopens it', async () => {
    const now = new Date().toISOString();
    const original = JSON.stringify([{
      id: 'legacy', status: 'completed', progress: 100, createdAt: now, updatedAt: now,
      parameters: { geneSymbol: 'thrL', organism: 'Escherichia coli', idempotencyKey: 'migrate' },
      result: { finalReport: 'migrated' }, eventSeq: 1,
    }]);
    await writeFile(storageFile, original);
    vi.stubEnv('DGR_TASK_BACKEND', 'sqlite');
    const { taskStore } = await import('./task-store');
    expect((await taskStore.getTask('legacy'))?.result.finalReport).toBe('migrated');
    const pending = await taskStore.createTask({ geneSymbol: 'lacZ', organism: 'Escherichia coli' });
    expect(await readFile(storageFile, 'utf8')).toBe(original);

    vi.resetModules();
    const { taskStore: reopened } = await import('./task-store');
    expect((await reopened.getTask('legacy'))?.result.finalReport).toBe('migrated');
    expect((await reopened.getTask(pending.id))?.status).toBe('pending');

    vi.stubEnv('DGR_TASK_BACKEND', 'json');
    vi.resetModules();
    const { taskStore: oldBackend } = await import('./task-store');
    await expect(oldBackend.getAllTasks()).rejects.toThrow('SQLite task ledger exists');
  });

  it('persists and enforces the execution-attempt budget', async () => {
    const { taskStore, TaskAttemptsExhaustedError } = await import('./task-store');
    const task = await taskStore.createTask({ geneSymbol: 'thrL', organism: 'Escherichia coli' });

    expect((await taskStore.beginTaskAttempt(task.id, 2)).attempts).toBe(1);
    expect((await taskStore.beginTaskAttempt(task.id, 2)).attempts).toBe(2);
    await expect(taskStore.beginTaskAttempt(task.id, 2)).rejects.toBeInstanceOf(TaskAttemptsExhaustedError);

    const persisted = JSON.parse(await readFile(storageFile, 'utf8'));
    expect(persisted[0].attempts).toBe(2);
  });

  it('persists cancellation finalized during restart recovery', async () => {
    const { taskStore } = await import('./task-store');
    const task = await taskStore.createTask({ geneSymbol: 'thrL', organism: 'Escherichia coli' });
    await taskStore.requestCancellation(task.id);

    expect(await taskStore.recoverInterruptedTasks()).toEqual([]);
    const persisted = JSON.parse(await readFile(storageFile, 'utf8'));
    expect(persisted[0].status).toBe('cancelled');
    expect(persisted[0].step).toBe('cancelled-before-recovery');
  });

  it('fails closed when file-backed tasks run on a production ephemeral runtime', async () => {
    process.env.VERCEL = '1';
    mutableEnv.NODE_ENV = 'production';
    vi.resetModules();
    const { taskStore } = await import('./task-store');

    await expect(taskStore.getAllTasks()).rejects.toThrow(
      'Durable MCP research tasks cannot use file storage on an ephemeral runtime'
    );
  });

  it('quarantines a corrupt ledger and remains fail-closed across module restart', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await writeFile(storageFile, '{not valid json', 'utf8');
    vi.resetModules();
    const { taskStore } = await import('./task-store');

    await expect(taskStore.getAllTasks()).rejects.toThrow('Task storage is locked');
    expect((await readdir(directory)).some(name => name.startsWith('tasks.json.corrupt.'))).toBe(true);
    await expect(readFile(storageFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(errorLog).toHaveBeenCalled();

    vi.resetModules();
    const { taskStore: restartedStore } = await import('./task-store');
    await expect(restartedStore.createTask({
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
    })).rejects.toThrow('Task storage is locked');
  });

  it('fails closed for a declared multi-worker file-backed deployment', async () => {
    process.env.DGR_WORKER_COUNT = '2';
    vi.resetModules();
    const { taskStore } = await import('./task-store');

    await expect(taskStore.getAllTasks()).rejects.toThrow(
      'file-backed durable task store requires exactly one Node worker'
    );
  });
});
