import { GeneResearchTask, ResearchParameters, TERMINAL_TASK_STATUSES, createTask, updateTaskStatus, updateTaskResult, updateTaskError } from '@/models/task';
import { promises as fs } from 'fs';
import path from 'path';
import { createHash, randomUUID } from 'node:crypto';
import { acquireTaskLedgerLock, SqliteTaskLedger, type StoredTask } from './sqlite-task-ledger';

export class IdempotencyConflictError extends Error {
  constructor(idempotencyKey: string) {
    super(`Idempotency key "${idempotencyKey}" was already used with different research parameters`);
    this.name = 'IdempotencyConflictError';
  }
}

export class TaskAttemptsExhaustedError extends Error {
  constructor(taskId: string, maxAttempts: number) {
    super(`Task ${taskId} exhausted its durable ${maxAttempts}-attempt execution budget`);
    this.name = 'TaskAttemptsExhaustedError';
  }
}

export class TaskCapacityError extends Error {
  constructor() {
    super('Research queue is at capacity');
    this.name = 'TaskCapacityError';
  }
}

class TaskStoreCorruptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskStoreCorruptionError';
  }
}

class TaskStoreRecoveryRequiredError extends Error {
  constructor(quarantinePath: string) {
    super(
      `Task storage is locked because a corrupt ledger was quarantined at ${quarantinePath}. ` +
        'Restore a verified ledger or remove the quarantine only after reconciling task and idempotency state.'
    );
    this.name = 'TaskStoreRecoveryRequiredError';
  }
}

// 文件存储路径
const STORAGE_FILE = process.env.MCP_TASK_STORAGE_FILE
  ? path.resolve(process.env.MCP_TASK_STORAGE_FILE)
  : path.join(process.cwd(), 'tasks.json');
const STORAGE_DIR = path.dirname(STORAGE_FILE);
const RESULT_DIR = path.join(STORAGE_DIR, 'research-results');
const SQLITE_FILE = STORAGE_FILE + '.sqlite';
const BACKEND = process.env.DGR_TASK_BACKEND || 'json';
let sqliteLedger: SqliteTaskLedger | undefined;
const IS_EPHEMERAL_RUNTIME = Boolean(process.env.VERCEL || process.env.CF_PAGES);
const ALLOW_EPHEMERAL_TASK_STORAGE = process.env.DGR_ALLOW_EPHEMERAL_TASK_STORAGE === 'true';
const CONFIGURED_WORKER_COUNT = Number(process.env.DGR_WORKER_COUNT || process.env.WEB_CONCURRENCY || 1);
let warnedAboutEphemeralOverride = false;

function assertSupportedRuntime() {
  if (!['json', 'sqlite'].includes(BACKEND)) throw new Error('Invalid DGR_TASK_BACKEND');

  if (!Number.isInteger(CONFIGURED_WORKER_COUNT) || CONFIGURED_WORKER_COUNT !== 1) {
    throw new Error(
      'The file-backed durable task store requires exactly one Node worker. ' +
        'Use DGR_WORKER_COUNT=1 or configure a database-backed queue with cross-process leases.'
    );
  }

  if (!IS_EPHEMERAL_RUNTIME) {
    return;
  }

  if (!ALLOW_EPHEMERAL_TASK_STORAGE || process.env.NODE_ENV === 'production') {
    throw new Error(
      'Durable MCP research tasks cannot use file storage on an ephemeral runtime. ' +
        'Run a long-lived Node worker or configure a durable task backend.'
    );
  }

  if (warnedAboutEphemeralOverride) return;
  warnedAboutEphemeralOverride = true;
  console.warn(
    '[TaskStore] DGR_ALLOW_EPHEMERAL_TASK_STORAGE is enabled for development. ' +
      'Queued tasks and audit records can disappear when the runtime is recycled.'
  );
}

// ─── 内存缓存 + 文件锁 ────────────────────────────────────────────────────────
// 问题根源：多个并发请求同时读写 tasks.json 导致 JSON 损坏
// 解决方案：
// 1. 内存缓存所有任务（读写 O(1)）
// 2. 文件操作排队执行（串行化，消除单进程 race condition）
// 3. 每次状态变更使用临时文件 + 原子重命名持久化
// A separate SQLite lock guards the ledger against a second process. The
// Promise chain serializes mutations inside the owning process.

// 内存缓存
let taskCache: Map<string, GeneResearchTask> = new Map();
const resultDigests = new WeakMap<GeneResearchTask, string>();
let cacheLoaded = false;

// 文件锁：Promise 链，确保所有文件操作串行执行
let fileLock: Promise<void> = Promise.resolve();

function cloneTask(task: GeneResearchTask): GeneResearchTask {
  return structuredClone(task);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function idempotentParameters(parameters: ResearchParameters): Record<string, unknown> {
  const { idempotencyKey: _idempotencyKey, correlationId: _correlationId, ...semanticParameters } = parameters;
  return semanticParameters;
}

function sameIdempotentRequest(left: ResearchParameters, right: ResearchParameters): boolean {
  return stableSerialize(idempotentParameters(left)) === stableSerialize(idempotentParameters(right));
}

// 串行化文件操作 - 简单可靠的 Promise 链
async function withFileLock<T>(operation: () => Promise<T>): Promise<T> {
  const currentLock = fileLock;
  
  // 创建新的完成标记
  let finishLock: () => void;
  const newLock = new Promise<void>((resolve) => {
    finishLock = resolve;
  });
  
  // 让后续操作等待当前锁
  fileLock = newLock;
  
  try {
    // 等待前面的操作完成
    await currentLock;
    // 执行当前操作
    return await operation();
  } finally {
    // 标记当前操作完成，让下一个继续
    finishLock!();
  }
}

// 确保存储文件存在
export async function ensureTaskLedgerOwnership(): Promise<void> {
  assertSupportedRuntime();
  await fs.mkdir(STORAGE_DIR, { recursive: true, mode: 0o700 });
  if (process.env.NODE_ENV !== 'test') {
    acquireTaskLedgerLock(path.join(await fs.realpath(STORAGE_DIR), path.basename(STORAGE_FILE)));
  }
}

async function ensureStorageFile(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  try {
    await fs.access(STORAGE_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;

    // A missing primary file alongside a quarantined ledger means an operator
    // has not reconciled the durable idempotency/task history yet. Never
    // silently create an empty store and allow duplicate research work.
    const quarantinePrefix = `${path.basename(STORAGE_FILE)}.corrupt.`;
    const quarantined = (await fs.readdir(STORAGE_DIR))
      .filter(entry => entry.startsWith(quarantinePrefix))
      .sort()
      .at(-1);
    if (quarantined) {
      throw new TaskStoreRecoveryRequiredError(path.join(STORAGE_DIR, quarantined));
    }

    // First boot: create an empty ledger with the same crash-durable atomic
    // write path used for every later mutation.
    await writeStorageFileDurably(JSON.stringify([]));
  }
}

// 从文件加载到内存
async function loadFromDisk(): Promise<void> {
  if (cacheLoaded) return;

  await withFileLock(async () => {
    if (cacheLoaded) return;
    let fromSqlite = false;
    try {
      await ensureTaskLedgerOwnership();
      if (BACKEND === 'sqlite') {
        sqliteLedger ??= new SqliteTaskLedger(SQLITE_FILE);
      } else {
        const migrated = await fs.stat(SQLITE_FILE).catch(error => {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          return null;
        });
        if (migrated) throw new Error('SQLite task ledger exists. Use DGR_TASK_BACKEND=sqlite or restore an explicit backup.');
      }
      fromSqlite = Boolean(sqliteLedger);
      const sqliteRows = sqliteLedger?.read() ?? null;
      let parsed: unknown = sqliteRows;
      if (sqliteRows === null) {
        fromSqlite = false;
        await ensureStorageFile();
        parsed = JSON.parse(await fs.readFile(STORAGE_FILE, 'utf8'));
      }
      if (!Array.isArray(parsed)) {
        throw new TaskStoreCorruptionError('Task store root must be a JSON array');
      }
      const tasks = parsed as StoredTask[];
      taskCache.clear();
      const idempotencyKeys = new Set<string>();
      for (const task of tasks) {
        if (
          !task ||
          typeof task.id !== 'string' ||
          !task.id ||
          (task.workspaceId !== undefined && (typeof task.workspaceId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(task.workspaceId))) ||
          !task.parameters ||
          (task.parameters.mode === 'general'
            ? typeof task.parameters.query !== 'string'
            : typeof task.parameters.geneSymbol !== 'string' || typeof task.parameters.organism !== 'string') ||
          !['pending', 'in_progress', 'completed', 'failed', 'cancel_requested', 'cancelled'].includes(task.status) ||
          !Number.isFinite(task.progress) ||
          task.progress < 0 ||
          task.progress > 100 ||
          (task.attempts !== undefined && (!Number.isInteger(task.attempts) || task.attempts < 0)) ||
          Number.isNaN(new Date(task.createdAt).getTime()) ||
          Number.isNaN(new Date(task.updatedAt).getTime())
        ) {
          throw new TaskStoreCorruptionError(`Task store contains an invalid task record (${task?.id || 'unknown id'})`);
        }
        if (taskCache.has(task.id)) {
          throw new TaskStoreCorruptionError(`Task store contains duplicate task id ${task.id}`);
        }
        if (task.parameters.idempotencyKey) {
          const scopedKey = JSON.stringify([task.workspaceId, task.parameters.idempotencyKey]);
          if (idempotencyKeys.has(scopedKey)) {
            throw new TaskStoreCorruptionError(
              `Task store contains duplicate idempotency key ${task.parameters.idempotencyKey}`
            );
          }
          idempotencyKeys.add(scopedKey);
        }
        const { resultSha256, ...data } = task;
        const restored = {
          ...data,
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt),
          eventSeq: Number.isInteger(task.eventSeq) ? task.eventSeq : 0,
        };
        if (resultSha256 !== undefined) {
          if (task.status !== 'completed' || task.result !== undefined || !/^[a-f0-9]{64}$/.test(resultSha256)) {
            throw new TaskStoreCorruptionError(`Invalid result reference for task ${task.id}`);
          }
          const contents = await fs.readFile(path.join(RESULT_DIR, `${resultSha256}.json`), 'utf8');
          if (digestResult(contents) !== resultSha256) throw new Error(`Research result integrity check failed for task ${task.id}`);
          restored.result = JSON.parse(contents);
          resultDigests.set(restored, resultSha256);
        }
        taskCache.set(task.id, restored);
      }
      if (sqliteLedger && sqliteRows === null) await writeCacheToDiskUnlocked(taskCache, new Map(), true);
      cacheLoaded = true;
      console.log(`[TaskStore] Loaded ${tasks.length} tasks from disk`);
    } catch (error) {
      console.error('[TaskStore] Failed to load from disk:', error instanceof Error ? error.name : 'UnknownError');
      // Preserve a corrupt ledger for forensic recovery rather than silently
      // destroying every queued research task.
      if (!fromSqlite && (error instanceof SyntaxError || error instanceof TaskStoreCorruptionError)) {
        const quarantinePath = `${STORAGE_FILE}.corrupt.${Date.now()}`;
        console.log(`[TaskStore] Detected corrupted task store; moving it to ${quarantinePath}`);
        try {
          await fs.rename(STORAGE_FILE, quarantinePath);
        } catch (renameError) {
          console.error('[TaskStore] Failed to quarantine corrupt task store:', renameError);
          throw error;
        }
        taskCache.clear();
        cacheLoaded = false;
        throw new TaskStoreRecoveryRequiredError(quarantinePath);
      } else {
        throw error;
      }
    }
  });
}

async function writeStorageFileDurably(contents: string, destination = STORAGE_FILE): Promise<void> {
  const directory = path.dirname(destination);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const tempFile = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  let tempHandle: Awaited<ReturnType<typeof fs.open>> | null = null;
  try {
    // wx prevents clobbering an unexpected file, and 0600 keeps task prompts,
    // research results, and access-sensitive metadata owner-readable only.
    tempHandle = await fs.open(tempFile, 'wx', 0o600);
    await tempHandle.writeFile(contents, 'utf8');
    await tempHandle.sync();
    await tempHandle.close();
    tempHandle = null;
    await fs.rename(tempFile, destination);

    // Persist the directory entry where the platform supports directory
    // fsync. Some filesystems reject it, so this last strengthening step is
    // deliberately best-effort after the atomic rename has succeeded.
    let directoryHandle: Awaited<ReturnType<typeof fs.open>> | null = null;
    try {
      directoryHandle = await fs.open(directory, 'r');
      await directoryHandle.sync();
    } catch (error) {
      console.warn('[TaskStore] Could not fsync task storage directory:', error);
    } finally {
      await directoryHandle?.close().catch(() => undefined);
    }
  } catch (error) {
    await tempHandle?.close().catch(() => undefined);
    await fs.rm(tempFile, { force: true }).catch(() => undefined);
    console.error('[TaskStore] Failed to sync to disk:', error);
    throw error;
  }
}

function digestResult(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

async function writeCacheToDiskUnlocked(
  snapshot: Map<string, GeneResearchTask>,
  previous: Map<string, GeneResearchTask>,
  initialize = false,
): Promise<void> {
  const tasks: StoredTask[] = [];
  for (const task of snapshot.values()) {
    if (sqliteLedger && previous.get(task.id) === task) continue;
    if (task.status !== 'completed' || task.result === undefined) {
      tasks.push(task);
      continue;
    }
    let digest = resultDigests.get(task);
    if (!digest) {
      const contents = JSON.stringify(task.result);
      if (!initialize && Buffer.byteLength(contents) > 64 * 1024 * 1024) {
        throw new Error('Research result exceeds the 64 MiB artifact limit');
      }
      digest = digestResult(contents);
      // Persist the immutable result first. A failed index write can leave an
      // unreferenced artifact, but an acknowledged task always has its result.
      await writeStorageFileDurably(contents, path.join(RESULT_DIR, `${digest}.json`));
      resultDigests.set(task, digest);
    }
    const { result: _result, ...metadata } = task;
    tasks.push({ ...metadata, resultSha256: digest });
  }
  if (sqliteLedger) {
    sqliteLedger.write(tasks, [...previous.keys()].filter(id => !snapshot.has(id)), initialize);
  } else {
    await writeStorageFileDurably(JSON.stringify(tasks, null, 2));
  }
}

async function mutateCacheAndSync<T>(operation: () => { result: T; changed: boolean }): Promise<T> {
  return withFileLock(async () => {
    const previousCache = taskCache;
    taskCache = new Map(previousCache);
    try {
      const { result, changed } = operation();
      const snapshot = taskCache;
      taskCache = previousCache;
      if (changed) {
        await writeCacheToDiskUnlocked(snapshot, previousCache);
        taskCache = snapshot;
      }
      return result;
    } catch (error) {
      taskCache = previousCache;
      throw error;
    }
  });
}

// 任务存储服务
class TaskStore {
  // 初始化：确保缓存加载
  private async ensureCache(): Promise<void> {
    assertSupportedRuntime();
    if (!cacheLoaded) {
      await loadFromDisk();
    }
  }

  // 获取所有任务
  async getAllTasks(): Promise<GeneResearchTask[]> {
    await this.ensureCache();
    await fileLock;
    const tasks = Array.from(taskCache.values(), cloneTask);
    console.log(`[TaskStore] Getting all tasks: ${tasks.length} found`);
    return tasks;
  }

  async listTasks(offset: number, limit: number, includeResult: boolean, workspaceId?: string) {
    await this.ensureCache();
    await fileLock;
    const tasks = Array.from(taskCache.values()).filter(task => task.workspaceId === workspaceId && task.parameters.mode !== 'general');
    return {
      total: tasks.length,
      tasks: tasks.slice(offset, offset + limit).map(task => {
        if (includeResult) return cloneTask(task);
        const { result: _result, ...metadata } = task;
        return cloneTask(metadata);
      }),
    };
  }

  // 获取单个任务
  async getTask(taskId: string): Promise<GeneResearchTask | null> {
    await this.ensureCache();
    await fileLock;
    const cachedTask = taskCache.get(taskId);
    const task = cachedTask ? cloneTask(cachedTask) : null;
    console.log(`[TaskStore] Getting task ${taskId}: ${task ? 'found' : 'not found'}`);
    return task;
  }

  async getTaskByArtifactId(artifactId: string, workspaceId?: string): Promise<GeneResearchTask | null> {
    await this.ensureCache();
    await fileLock;
    const direct = taskCache.get(artifactId);
    if (direct && direct.workspaceId === workspaceId) return cloneTask(direct);
    const task = Array.from(taskCache.values()).find(candidate =>
      candidate.workspaceId === workspaceId && candidate.result?.download?.researchId === artifactId);
    return task ? cloneTask(task) : null;
  }

  async getArtifactSize(taskId: string): Promise<number | undefined> {
    await this.ensureCache();
    await fileLock;
    const task = taskCache.get(taskId);
    const digest = task && resultDigests.get(task);
    return digest ? (await fs.stat(path.join(RESULT_DIR, `${digest}.json`))).size : undefined;
  }

  async getTaskMetadata(taskId: string): Promise<GeneResearchTask | null> {
    await this.ensureCache();
    await fileLock;
    const task = taskCache.get(taskId);
    if (!task) return null;
    const { result: _result, ...metadata } = task;
    return cloneTask(metadata);
  }

  async findTaskByIdempotencyKey(idempotencyKey?: string, workspaceId?: string): Promise<GeneResearchTask | null> {
    if (!idempotencyKey) return null;
    await this.ensureCache();
    await fileLock;
    const task = Array.from(taskCache.values()).find(task => task.workspaceId === workspaceId && task.parameters.idempotencyKey === idempotencyKey);
    return task ? cloneTask(task) : null;
  }

  /**
   * Convert work interrupted by a process restart into resumable pending work.
   * A durable worker can safely call this at startup; completed and terminal
   * tasks are never re-enqueued.
   */
  async recoverInterruptedTasks(): Promise<GeneResearchTask[]> {
    await this.ensureCache();
    return mutateCacheAndSync<GeneResearchTask[]>(() => {
      const recovered: GeneResearchTask[] = [];
      let changed = false;
      for (const [taskId, task] of taskCache.entries()) {
        if (task.status === 'cancel_requested') {
          taskCache.set(taskId, {
            ...task,
            status: 'cancelled',
            step: 'cancelled-before-recovery',
            updatedAt: new Date(),
            eventSeq: task.eventSeq + 1,
          });
          changed = true;
        } else if (task.status === 'pending' || task.status === 'in_progress') {
          const resumable = {
            ...task,
            status: 'pending' as const,
            step: task.status === 'in_progress' ? 'recovered-after-restart' : task.step,
            updatedAt: new Date(),
            eventSeq: task.eventSeq + 1,
          };
          taskCache.set(taskId, resumable);
          recovered.push(cloneTask(resumable));
          changed = true;
        }
      }
      return { result: recovered, changed };
    });
  }

  async createOrGetTask(parameters: ResearchParameters, maxActiveTasks = Infinity, workspaceId?: string): Promise<{ task: GeneResearchTask; created: boolean }> {
    await this.ensureCache();

    return mutateCacheAndSync<{ task: GeneResearchTask; created: boolean }>(() => {
      if (parameters.idempotencyKey) {
        const existing = Array.from(taskCache.values()).find(
          task => task.workspaceId === workspaceId && task.parameters.idempotencyKey === parameters.idempotencyKey
        );
        if (existing) {
          if (!sameIdempotentRequest(existing.parameters, parameters)) {
            throw new IdempotencyConflictError(parameters.idempotencyKey);
          }
          return { result: { task: cloneTask(existing), created: false }, changed: false };
        }
      }

      // Charge admission to the workspace even if a job fails or is cancelled.
      // Idempotent replays above do not consume another slot.
      const dailyCutoff = Date.now() - 86_400_000;
      const dailyLimit = workspaceId ? 120 : 500;
      let dailyTasks = 0;
      let activeTasks = 0;
      let activeWorkspaceTasks = 0;
      for (const task of taskCache.values()) {
        if (task.workspaceId === workspaceId && task.createdAt.getTime() > dailyCutoff && ++dailyTasks >= dailyLimit) {
          throw new TaskCapacityError();
        }
        if (TERMINAL_TASK_STATUSES.has(task.status)) continue;
        if (++activeTasks >= maxActiveTasks || (workspaceId && task.workspaceId === workspaceId && ++activeWorkspaceTasks >= 10)) {
          throw new TaskCapacityError();
        }
      }

      // The durable record must not retain references owned by an HTTP/MCP
      // caller; later caller mutation would otherwise change cache state
      // without an event sequence increment or disk write.
      const task = { ...createTask(structuredClone(parameters)), workspaceId };
      taskCache.set(task.id, task);
      return { result: { task: cloneTask(task), created: true }, changed: true };
    });
  }

  // 创建任务
  async createTask(parameters: ResearchParameters): Promise<GeneResearchTask> {
    const { task } = await this.createOrGetTask(parameters);
    console.log(`[TaskStore] Created or retrieved task: ${task.id}, total: ${taskCache.size}`);
    return task;
  }

  // 更新任务状态
  async updateTaskStatus(
    taskId: string,
    status: GeneResearchTask['status'],
    progress?: number,
    step?: string
  ): Promise<GeneResearchTask> {
    await this.ensureCache();
    
    return mutateCacheAndSync(() => {
      const task = taskCache.get(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      const updatedTask = updateTaskStatus(task, status, progress, step);
      if (updatedTask === task) {
        return { result: cloneTask(task), changed: false };
      }
      taskCache.set(taskId, updatedTask);
      return { result: cloneTask(updatedTask), changed: true };
    });
  }

  // 更新任务结果
  async updateTaskResult(taskId: string, result: any): Promise<GeneResearchTask> {
    await this.ensureCache();
    
    return mutateCacheAndSync(() => {
      const task = taskCache.get(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      const updatedTask = updateTaskResult(task, structuredClone(result));
      if (updatedTask === task) {
        return { result: cloneTask(task), changed: false };
      }
      taskCache.set(taskId, updatedTask);
      return { result: cloneTask(updatedTask), changed: true };
    });
  }

  // 更新任务错误
  async updateTaskError(taskId: string, error: string): Promise<GeneResearchTask> {
    await this.ensureCache();
    
    return mutateCacheAndSync(() => {
      const task = taskCache.get(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      const updatedTask = updateTaskError(task, error);
      if (updatedTask === task) {
        return { result: cloneTask(task), changed: false };
      }
      taskCache.set(taskId, updatedTask);
      return { result: cloneTask(updatedTask), changed: true };
    });
  }

  async requestCancellation(taskId: string): Promise<GeneResearchTask> {
    return this.updateTaskStatus(taskId, 'cancel_requested', undefined, 'cancel-requested');
  }

  /**
   * Persist an execution attempt before cache/provider work starts. This makes
   * the retry ceiling survive worker crashes and prevents restart loops from
   * invoking paid providers forever.
   */
  async beginTaskAttempt(taskId: string, maxAttempts: number): Promise<GeneResearchTask> {
    await this.ensureCache();
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
      throw new Error('maxAttempts must be a positive integer');
    }

    return mutateCacheAndSync(() => {
      const task = taskCache.get(taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);
      if (task.status !== 'pending' && task.status !== 'in_progress') {
        return { result: cloneTask(task), changed: false };
      }

      const attempts = task.attempts ?? 0;
      if (attempts >= maxAttempts) {
        throw new TaskAttemptsExhaustedError(taskId, maxAttempts);
      }

      const nextAttempt = attempts + 1;
      const updatedTask = {
        ...updateTaskStatus(task, 'in_progress', 0, `research-attempt-${nextAttempt}`),
        attempts: nextAttempt,
      };
      taskCache.set(taskId, updatedTask);
      return { result: cloneTask(updatedTask), changed: true };
    });
  }

  // 删除任务
  async deleteTask(taskId: string): Promise<boolean> {
    await this.ensureCache();

    const deleted = await mutateCacheAndSync(() => {
      if (!taskCache.has(taskId)) {
        return { result: false, changed: false };
      }
      taskCache.delete(taskId);
      return { result: true, changed: true };
    });
    if (deleted) {
      console.log(`[TaskStore] Deleted task ${taskId}, remaining: ${taskCache.size}`);
    }
    return deleted;
  }

  // 清除所有任务
  async clearAllTasks(): Promise<boolean> {
    await this.ensureCache();
    await mutateCacheAndSync(() => {
      const changed = taskCache.size > 0;
      taskCache.clear();
      return { result: true, changed };
    });
    console.log('[TaskStore] Cleared all tasks');
    return true;
  }
}

// Next route bundles and instrumentation can load the module independently.
const runtime = globalThis as typeof globalThis & { dgrTaskStore?: TaskStore };
export const taskStore = process.env.NODE_ENV === 'production'
  ? (runtime.dgrTaskStore ??= new TaskStore())
  : new TaskStore();
