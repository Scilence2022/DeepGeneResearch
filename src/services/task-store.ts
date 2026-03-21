import { GeneResearchTask, GeneResearchParameters, createTask, updateTaskStatus, updateTaskResult, updateTaskError } from '@/models/task';
import { promises as fs } from 'fs';
import path from 'path';

// 文件存储路径
const STORAGE_FILE = path.join(process.cwd(), 'tasks.json');

// 确保存储文件存在
async function ensureStorageFile() {
  try {
    await fs.access(STORAGE_FILE);
  } catch {
    await fs.writeFile(STORAGE_FILE, JSON.stringify([]));
  }
}

// 任务存储服务
class TaskStore {
  // 获取所有任务
  async getAllTasks(): Promise<GeneResearchTask[]> {
    try {
      await ensureStorageFile();
      const data = await fs.readFile(STORAGE_FILE, 'utf8');
      const tasks = JSON.parse(data);
      console.log('Getting all tasks:', tasks.length, 'tasks found');
      return tasks;
    } catch (error) {
      console.error('Error getting tasks:', error);
      return [];
    }
  }

  // 获取单个任务
  async getTask(taskId: string): Promise<GeneResearchTask | null> {
    try {
      const tasks = await this.getAllTasks();
      console.log('Getting task:', taskId);
      const task = tasks.find((task: GeneResearchTask) => task.id === taskId) || null;
      console.log('Task found:', task ? 'Yes' : 'No');
      return task;
    } catch (error) {
      console.error(`Error getting task ${taskId}:`, error);
      return null;
    }
  }

  // 创建任务
  async createTask(parameters: GeneResearchParameters): Promise<GeneResearchTask> {
    try {
      const tasks = await this.getAllTasks();
      const task = createTask(parameters);
      tasks.push(task);
      await fs.writeFile(STORAGE_FILE, JSON.stringify(tasks, null, 2));
      console.log('Created task:', task.id, 'Total tasks:', tasks.length);
      return task;
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  }

  // 更新任务
  async updateTask(updatedTask: GeneResearchTask): Promise<GeneResearchTask> {
    try {
      const tasks = await this.getAllTasks();
      const index = tasks.findIndex((task: GeneResearchTask) => task.id === updatedTask.id);
      if (index === -1) {
        throw new Error(`Task ${updatedTask.id} not found`);
      }
      tasks[index] = updatedTask;
      await fs.writeFile(STORAGE_FILE, JSON.stringify(tasks, null, 2));
      return updatedTask;
    } catch (error) {
      console.error(`Error updating task ${updatedTask.id}:`, error);
      throw error;
    }
  }

  // 更新任务状态
  async updateTaskStatus(
    taskId: string,
    status: GeneResearchTask['status'],
    progress?: number,
    step?: string
  ): Promise<GeneResearchTask> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    const updatedTask = updateTaskStatus(task, status, progress, step);
    return await this.updateTask(updatedTask);
  }

  // 更新任务结果
  async updateTaskResult(taskId: string, result: any): Promise<GeneResearchTask> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    const updatedTask = updateTaskResult(task, result);
    return await this.updateTask(updatedTask);
  }

  // 更新任务错误
  async updateTaskError(taskId: string, error: string): Promise<GeneResearchTask> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    const updatedTask = updateTaskError(task, error);
    return await this.updateTask(updatedTask);
  }

  // 删除任务
  async deleteTask(taskId: string): Promise<boolean> {
    try {
      const tasks = await this.getAllTasks();
      const filteredTasks = tasks.filter((task: GeneResearchTask) => task.id !== taskId);
      await fs.writeFile(STORAGE_FILE, JSON.stringify(filteredTasks, null, 2));
      return true;
    } catch (error) {
      console.error(`Error deleting task ${taskId}:`, error);
      return false;
    }
  }

  // 清除所有任务
  async clearAllTasks(): Promise<boolean> {
    try {
      await fs.writeFile(STORAGE_FILE, JSON.stringify([]));
      return true;
    } catch (error) {
      console.error('Error clearing tasks:', error);
      return false;
    }
  }
}

// 导出单例实例
export const taskStore = new TaskStore();
