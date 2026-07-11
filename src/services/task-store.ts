import { GeneResearchTask, GeneResearchParameters, createTask, updateTaskStatus, updateTaskResult, updateTaskError } from '@/models/task';
import { promises as fs } from 'fs';
import path from 'path';

// 文件存储路径
const STORAGE_FILE = process.env.MCP_TASK_STORAGE_FILE
  ? path.resolve(process.env.MCP_TASK_STORAGE_FILE)
  : path.join(process.cwd(), 'tasks.json');
const STORAGE_DIR = path.dirname(STORAGE_FILE);
const IS_EPHEMERAL_RUNTIME = Boolean(process.env.VERCEL || process.env.CF_PAGES);
let warnedAboutEphemeralRuntime = false;

function warnIfEphemeralRuntime() {
  if (!IS_EPHEMERAL_RUNTIME || warnedAboutEphemeralRuntime) {
    return;
  }

  warnedAboutEphemeralRuntime = true;
  console.warn(
    '[TaskStore] File-backed MCP task storage is ephemeral on serverless/Pages deployments. ' +
      'Use a single long-lived Node process or provide durable storage before relying on queued MCP tasks.'
  );
}

// ─── 内存缓存 + 文件锁 ────────────────────────────────────────────────────────
// 问题根源：多个并发请求同时读写 tasks.json 导致 JSON 损坏
// 解决方案：
// 1. 内存缓存所有任务（读写 O(1)）
// 2. 文件操作排队执行（串行化，消除 race condition）
// 3. 定期批量写盘（减少 IO）

// 内存缓存
let taskCache: Map<string, GeneResearchTask> = new Map();
let cacheLoaded = false;

// 文件锁：Promise 链，确保所有文件操作串行执行
let fileLock: Promise<void> = Promise.resolve();

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
async function ensureStorageFile(): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  try {
    await fs.access(STORAGE_FILE);
  } catch {
    // 文件不存在，创建空数组
    await fs.writeFile(STORAGE_FILE, JSON.stringify([]), 'utf8');
  }
}

// 从文件加载到内存
async function loadFromDisk(): Promise<void> {
  if (cacheLoaded) return;

  await withFileLock(async () => {
    try {
      await ensureStorageFile();
      const data = await fs.readFile(STORAGE_FILE, 'utf8');
      const tasks: GeneResearchTask[] = JSON.parse(data);
      taskCache.clear();
      for (const task of tasks) {
        taskCache.set(task.id, {
          ...task,
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt),
          eventSeq: Number.isInteger(task.eventSeq) ? task.eventSeq : 0,
        });
      }
      cacheLoaded = true;
      console.log(`[TaskStore] Loaded ${tasks.length} tasks from disk`);
    } catch (error) {
      console.error('[TaskStore] Failed to load from disk:', error);
      // Preserve a corrupt ledger for forensic recovery rather than silently
      // destroying every queued research task.
      if ((error as any).message?.includes('Unexpected')) {
        const quarantinePath = `${STORAGE_FILE}.corrupt.${Date.now()}`;
        console.log(`[TaskStore] Detected corrupted task store; moving it to ${quarantinePath}`);
        try {
          await fs.rename(STORAGE_FILE, quarantinePath);
        } catch (renameError) {
          console.error('[TaskStore] Failed to quarantine corrupt task store:', renameError);
          throw error;
        }
        taskCache.clear();
        await fs.writeFile(STORAGE_FILE, JSON.stringify([]), 'utf8');
        cacheLoaded = true;
      } else {
        throw error;
      }
    }
  });
}

// 同步缓存到文件（只在必要时调用）
async function syncToDisk(): Promise<void> {
  await withFileLock(async () => {
    try {
      const tasks = Array.from(taskCache.values());
      await fs.mkdir(STORAGE_DIR, { recursive: true });
      const tempFile = `${STORAGE_FILE}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(tasks, null, 2), 'utf8');
      await fs.rename(tempFile, STORAGE_FILE);
    } catch (error) {
      console.error('[TaskStore] Failed to sync to disk:', error);
      throw error;
    }
  });
}

// 任务存储服务
class TaskStore {
  // 初始化：确保缓存加载
  private async ensureCache(): Promise<void> {
    warnIfEphemeralRuntime();
    if (!cacheLoaded) {
      await loadFromDisk();
    }
  }

  // 获取所有任务
  async getAllTasks(): Promise<GeneResearchTask[]> {
    await this.ensureCache();
    const tasks = Array.from(taskCache.values());
    console.log(`[TaskStore] Getting all tasks: ${tasks.length} found`);
    return tasks;
  }

  // 获取单个任务
  async getTask(taskId: string): Promise<GeneResearchTask | null> {
    await this.ensureCache();
    const task = taskCache.get(taskId) || null;
    console.log(`[TaskStore] Getting task ${taskId}: ${task ? 'found' : 'not found'}`);
    return task;
  }

  async findTaskByIdempotencyKey(idempotencyKey?: string): Promise<GeneResearchTask | null> {
    if (!idempotencyKey) return null;
    await this.ensureCache();
    return Array.from(taskCache.values()).find(task => task.parameters.idempotencyKey === idempotencyKey) || null;
  }

  /**
   * Convert work interrupted by a process restart into resumable pending work.
   * A durable worker can safely call this at startup; completed and terminal
   * tasks are never re-enqueued.
   */
  async recoverInterruptedTasks(): Promise<GeneResearchTask[]> {
    await this.ensureCache();
    const recovered: GeneResearchTask[] = [];
    await withFileLock(async () => {
      for (const [taskId, task] of taskCache.entries()) {
        if (task.status === 'cancel_requested') {
          taskCache.set(taskId, {
            ...task,
            status: 'cancelled',
            step: 'cancelled-before-recovery',
            updatedAt: new Date(),
            eventSeq: task.eventSeq + 1,
          });
        } else if (task.status === 'pending' || task.status === 'in_progress') {
          const resumable = {
            ...task,
            status: 'pending' as const,
            step: task.status === 'in_progress' ? 'recovered-after-restart' : task.step,
            updatedAt: new Date(),
            eventSeq: task.eventSeq + 1,
          };
          taskCache.set(taskId, resumable);
          recovered.push(resumable);
        }
      }
    });
    if (recovered.length > 0) await syncToDisk();
    return recovered;
  }

  // 创建任务
  async createTask(parameters: GeneResearchParameters): Promise<GeneResearchTask> {
    await this.ensureCache();
    
    let task: GeneResearchTask;
    // Lock only protects the in-memory cache update
    await withFileLock(async () => {
      task = createTask(parameters);
      taskCache.set(task.id, task);
    });
    // Sync to disk AFTER releasing the lock to avoid deadlock
    // (syncToDisk uses its own lock internally)
    await syncToDisk();
    console.log(`[TaskStore] Created task: ${task!.id}, total: ${taskCache.size}`);
    return task!;
  }

  // 更新任务
  async updateTask(updatedTask: GeneResearchTask): Promise<GeneResearchTask> {
    await this.ensureCache();
    
    await withFileLock(async () => {
      if (!taskCache.has(updatedTask.id)) {
        throw new Error(`Task ${updatedTask.id} not found`);
      }
      taskCache.set(updatedTask.id, updatedTask);
    });
    // Sync to disk AFTER releasing the lock to avoid deadlock
    await syncToDisk();
    return updatedTask;
  }

  // 更新任务状态
  async updateTaskStatus(
    taskId: string,
    status: GeneResearchTask['status'],
    progress?: number,
    step?: string
  ): Promise<GeneResearchTask> {
    await this.ensureCache();
    
    let updatedTask: GeneResearchTask;
    await withFileLock(async () => {
      const task = taskCache.get(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      updatedTask = updateTaskStatus(task, status, progress, step);
      taskCache.set(taskId, updatedTask);
    });
    // Sync to disk AFTER releasing the lock to avoid deadlock
    await syncToDisk();
    return updatedTask!;
  }

  // 更新任务结果
  async updateTaskResult(taskId: string, result: any): Promise<GeneResearchTask> {
    await this.ensureCache();
    
    let updatedTask: GeneResearchTask;
    await withFileLock(async () => {
      const task = taskCache.get(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      updatedTask = updateTaskResult(task, result);
      taskCache.set(taskId, updatedTask);
    });
    // Sync to disk AFTER releasing the lock to avoid deadlock
    await syncToDisk();
    return updatedTask!;
  }

  // 更新任务错误
  async updateTaskError(taskId: string, error: string): Promise<GeneResearchTask> {
    await this.ensureCache();
    
    let updatedTask: GeneResearchTask;
    await withFileLock(async () => {
      const task = taskCache.get(taskId);
      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }
      updatedTask = updateTaskError(task, error);
      taskCache.set(taskId, updatedTask);
    });
    // Sync to disk AFTER releasing the lock to avoid deadlock
    await syncToDisk();
    return updatedTask!;
  }

  async requestCancellation(taskId: string): Promise<GeneResearchTask> {
    return this.updateTaskStatus(taskId, 'cancel_requested', undefined, 'cancel-requested');
  }

  // 删除任务
  async deleteTask(taskId: string): Promise<boolean> {
    await this.ensureCache();
    
    let deleted = false;
    await withFileLock(async () => {
      if (!taskCache.has(taskId)) {
        deleted = false;
        return;
      }
      taskCache.delete(taskId);
      deleted = true;
    });
    if (deleted) {
      // Sync to disk AFTER releasing the lock to avoid deadlock
      await syncToDisk();
      console.log(`[TaskStore] Deleted task ${taskId}, remaining: ${taskCache.size}`);
    }
    return deleted;
  }

  // 清除所有任务
  async clearAllTasks(): Promise<boolean> {
    await withFileLock(async () => {
      taskCache.clear();
    });
    // Sync to disk AFTER releasing the lock to avoid deadlock
    await syncToDisk();
    console.log('[TaskStore] Cleared all tasks');
    return true;
  }
}

// 导出单例实例
export const taskStore = new TaskStore();
