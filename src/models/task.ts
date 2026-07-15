import { v4 as uuidv4 } from 'uuid';
import type { GenomeTargetRef } from '@/contracts/annotation-change-set';

// 任务状态类型
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancel_requested' | 'cancelled';

export const TERMINAL_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
]);

const ALLOWED_TASK_TRANSITIONS: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
  pending: new Set(['pending', 'in_progress', 'failed', 'cancel_requested', 'cancelled']),
  in_progress: new Set(['in_progress', 'completed', 'failed', 'cancel_requested', 'cancelled']),
  cancel_requested: new Set(['cancel_requested', 'cancelled']),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export function canTransitionTaskStatus(from: TaskStatus, to: TaskStatus): boolean {
  return ALLOWED_TASK_TRANSITIONS[from].has(to);
}

// 任务参数类型
export interface GeneResearchParameters {
  geneSymbol: string;
  organism: string;
  researchFocus?: string[];
  specificAspects?: string[];
  diseaseContext?: string;
  experimentalApproach?: string;
  userPrompt?: string;
  language?: string;
  maxResult?: number;
  enableCitationImage?: boolean;
  enableReferences?: boolean;
  returnReportAsUrl?: boolean;
  returnDetailsAsUrl?: boolean;
  includeCodeXomicsAnnotationProposal?: boolean;
  /** Bypass and invalidate an otherwise matching semantic research cache entry. */
  forceRefresh?: boolean;
  /** Exact target returned by CodeXomics resolve_annotation_target. */
  target?: GenomeTargetRef;
  idempotencyKey?: string;
  correlationId?: string;
}

// 任务模型
export interface GeneResearchTask {
  id: string;
  status: TaskStatus;
  progress: number;
  createdAt: Date;
  updatedAt: Date;
  parameters: GeneResearchParameters;
  result?: any;
  error?: string;
  step?: string;
  eventSeq: number;
  attempts?: number;
}

// 创建新任务
export function createTask(parameters: GeneResearchParameters): GeneResearchTask {
  const now = new Date();
  return {
    id: uuidv4(),
    status: 'pending',
    progress: 0,
    createdAt: now,
    updatedAt: now,
    parameters,
    eventSeq: 0,
    attempts: 0,
  };
}

// 更新任务状态
export function updateTaskStatus(
  task: GeneResearchTask,
  status: TaskStatus,
  progress?: number,
  step?: string
): GeneResearchTask {
  if (!canTransitionTaskStatus(task.status, status)) {
    return task;
  }

  return {
    ...task,
    status,
    progress: progress === undefined ? task.progress : Math.max(0, Math.min(100, progress)),
    step: step ?? task.step,
    updatedAt: new Date(),
    eventSeq: task.eventSeq + 1,
  };
}

// 更新任务结果
export function updateTaskResult(
  task: GeneResearchTask,
  result: any
): GeneResearchTask {
  if (!canTransitionTaskStatus(task.status, 'completed')) {
    return task;
  }

  return {
    ...task,
    status: 'completed',
    progress: 100,
    result,
    updatedAt: new Date(),
    eventSeq: task.eventSeq + 1,
  };
}

// 更新任务错误
export function updateTaskError(
  task: GeneResearchTask,
  error: string
): GeneResearchTask {
  if (!canTransitionTaskStatus(task.status, 'failed')) {
    return task;
  }

  return {
    ...task,
    status: 'failed',
    error,
    updatedAt: new Date(),
    eventSeq: task.eventSeq + 1,
  };
}
