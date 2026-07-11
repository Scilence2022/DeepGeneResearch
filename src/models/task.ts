import { v4 as uuidv4 } from 'uuid';
import type { GenomeTargetRef } from '@/contracts/annotation-change-set';

// 任务状态类型
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancel_requested' | 'cancelled';

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
  };
}

// 更新任务状态
export function updateTaskStatus(
  task: GeneResearchTask,
  status: TaskStatus,
  progress?: number,
  step?: string
): GeneResearchTask {
  return {
    ...task,
    status,
    progress: progress ?? task.progress,
    step,
    updatedAt: new Date(),
    eventSeq: task.eventSeq + 1,
  };
}

// 更新任务结果
export function updateTaskResult(
  task: GeneResearchTask,
  result: any
): GeneResearchTask {
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
  return {
    ...task,
    status: 'failed',
    error,
    updatedAt: new Date(),
    eventSeq: task.eventSeq + 1,
  };
}
