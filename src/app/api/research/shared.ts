import { NextResponse } from 'next/server';
import { z } from 'zod';
import { taskStore } from '@/services/task-store';
import { isValidTaskId } from '@/utils/task-id-generator';
import type { TaskStatus } from '@/models/task';

export const researchOptions = z.object({
  query: z.string().trim().min(1).max(8_000),
  language: z.string().trim().min(1).max(64).default('English'),
  enableCitationImage: z.boolean().default(true),
  enableReferences: z.boolean().default(true),
  maxResult: z.number().int().min(1).max(20).default(5),
});

export const privateResponse = { 'Cache-Control': 'private, no-store' };

export function legacyStatus(status: TaskStatus) {
  return status === 'in_progress' ? 'in-progress' : status;
}

export async function readGeneralTask(taskId: string, includeResult = false) {
  if (!isValidTaskId(taskId)) return NextResponse.json({ error: 'Invalid task ID format' }, { status: 400 });
  const task = includeResult ? await taskStore.getTask(taskId) : await taskStore.getTaskMetadata(taskId);
  if (!task || task.parameters.mode !== 'general') {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }
  return { ...task, parameters: task.parameters };
}
