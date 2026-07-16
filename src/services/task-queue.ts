import { EventEmitter } from 'events';
import { GeneResearchTask, GeneResearchParameters } from '@/models/task';
import { taskStore } from './task-store';
import { initDeepResearchServer } from '@/app/api/mcp/server';
import { cacheService, isReusableResearchResult } from './cache';
import { storeResearchResult } from '@/utils/mcp-research-store';
import { buildCodeXomicsAnnotationProposal } from '@/utils/gene-research/codexomics-annotation';
import { enforceTaskMediaPolicy } from './task-result-projection';
import {
  hasStableGeneResearchIdentity,
  isSupportedGeneAnnotationFeatureType,
} from '@/contracts/gene-annotation-target';

const MCP_SERVER_BASE_URL = (process.env.MCP_SERVER_BASE_URL || '').trim().replace(/\/+$/, '');
const MCP_SEARCH_PROVIDER = process.env.MCP_SEARCH_PROVIDER || 'model';

export class TaskValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TaskValidationError';
  }
}

function formatMcpUrl(path: string): string {
  return MCP_SERVER_BASE_URL ? `${MCP_SERVER_BASE_URL}${path}` : path;
}

function getSourceHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function summarizeSourceCoverage(searchResults: any[], finalSources: any[]) {
  const taskSources = searchResults.flatMap((task) => task.sources || []);
  const allSources = [...taskSources, ...(finalSources || [])];
  const sourceDomains = Array.from(
    new Set(
      allSources
        .map((source) => source?.url ? getSourceHost(source.url) : null)
        .filter((host): host is string => Boolean(host))
    )
  ).sort();

  return {
    configuredSearchProvider: MCP_SEARCH_PROVIDER,
    searchTaskCount: searchResults.length,
    tasksWithSources: searchResults.filter((task) => (task.sources?.length || 0) > 0).length,
    sourceCount: allSources.length,
    uniqueSourceCount: new Set(allSources.map((source) => source?.url).filter(Boolean)).size,
    sourceDomains,
  };
}

export function isSubstantiveResearchResult(
  result: any,
  parameters?: GeneResearchParameters
): boolean {
  return Boolean(parameters) && isReusableResearchResult(parameters!, result);
}

// 任务队列类
export class TaskQueue extends EventEmitter {
  private queue: GeneResearchTask[] = [];
  private maxConcurrent = this.normalizeConcurrency(Number(process.env.DGR_MAX_CONCURRENT_RESEARCH || 2));
  private processingTasks = new Set<string>();
  private cancelledTasks = new Set<string>();
  private abortControllers = new Map<string, AbortController>();
  private recoveryPromise: Promise<void> | null = null;
  private readonly maxRetries = 3;

  private get maxAttempts() {
    return this.maxRetries + 1;
  }

  private normalizeConcurrency(value: number) {
    return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 2;
  }

  private validateParameters(parameters: GeneResearchParameters) {
    const boundedString = (value: unknown, field: string, maxLength: number, required = false) => {
      if (value === undefined || value === null || value === '') {
        if (required) throw new TaskValidationError(`${field} is required`);
        return;
      }
      if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
        throw new TaskValidationError(`${field} must be a non-empty string of at most ${maxLength} characters`);
      }
    };
    const boundedStringArray = (value: unknown, field: string, maxItems: number, maxLength: number) => {
      if (value === undefined) return;
      if (!Array.isArray(value) || value.length > maxItems) {
        throw new TaskValidationError(`${field} must contain at most ${maxItems} items`);
      }
      value.forEach((item, index) => boundedString(item, `${field}[${index}]`, maxLength, true));
    };

    boundedString(parameters.geneSymbol, 'geneSymbol', 128, true);
    boundedString(parameters.organism, 'organism', 256, true);
    boundedStringArray(parameters.researchFocus, 'researchFocus', 20, 128);
    boundedStringArray(parameters.specificAspects, 'specificAspects', 30, 256);
    boundedString(parameters.diseaseContext, 'diseaseContext', 1_000);
    boundedString(parameters.experimentalApproach, 'experimentalApproach', 1_000);
    boundedString(parameters.userPrompt, 'userPrompt', 8_000);
    boundedString(parameters.language, 'language', 64);
    boundedString(parameters.idempotencyKey, 'idempotencyKey', 256);
    boundedString(parameters.correlationId, 'correlationId', 256);
    if (parameters.forceRefresh !== undefined && typeof parameters.forceRefresh !== 'boolean') {
      throw new TaskValidationError('forceRefresh must be a boolean');
    }
    if (
      parameters.maxResult !== undefined &&
      (!Number.isInteger(parameters.maxResult) || parameters.maxResult < 1 || parameters.maxResult > 20)
    ) {
      throw new TaskValidationError('maxResult must be an integer from 1 to 20');
    }
    if (parameters.currentAnnotation !== undefined) {
      if (!parameters.currentAnnotation || typeof parameters.currentAnnotation !== 'object' || Array.isArray(parameters.currentAnnotation)) {
        throw new TaskValidationError('currentAnnotation must be a bounded scientific qualifier snapshot');
      }
      const allowedFields = new Set(['product', 'note', 'EC_number', 'go_terms', 'ko', 'pathway', 'db_xref']);
      const unknownField = Object.keys(parameters.currentAnnotation).find(field => !allowedFields.has(field));
      if (unknownField) throw new TaskValidationError(`currentAnnotation.${unknownField} is not an allowed qualifier`);
      boundedString(parameters.currentAnnotation.product, 'currentAnnotation.product', 1_024);
      boundedStringArray(parameters.currentAnnotation.note, 'currentAnnotation.note', 32, 8_192);
      boundedStringArray(parameters.currentAnnotation.EC_number, 'currentAnnotation.EC_number', 64, 64);
      boundedStringArray(parameters.currentAnnotation.go_terms, 'currentAnnotation.go_terms', 256, 64);
      boundedStringArray(parameters.currentAnnotation.ko, 'currentAnnotation.ko', 128, 128);
      boundedStringArray(parameters.currentAnnotation.pathway, 'currentAnnotation.pathway', 256, 256);
      boundedStringArray(parameters.currentAnnotation.db_xref, 'currentAnnotation.db_xref', 512, 512);
      if (!parameters.target) {
        throw new TaskValidationError('currentAnnotation requires an exact resolved CodeXomics target');
      }
    }
    if (!parameters.target) return;

    if (typeof parameters.target !== 'object') {
      throw new TaskValidationError('target must be a resolved CodeXomics target object');
    }

    for (const field of ['workspaceId', 'genomeId', 'featureId', 'featureHash', 'chromosome'] as const) {
      boundedString(parameters.target[field], `target.${field}`, 512, true);
    }
    boundedString(parameters.target.annotationId, 'target.annotationId', 512);
    boundedString(parameters.target.featureType, 'target.featureType', 128, true);
    boundedString(parameters.target.locusTag, 'target.locusTag', 256);
    boundedString(parameters.target.geneSymbol, 'target.geneSymbol', 128);
    boundedString(parameters.target.proteinId, 'target.proteinId', 256);
    boundedString(parameters.target.organism, 'target.organism', 256);
    boundedString(parameters.target.assemblyAccession, 'target.assemblyAccession', 256);
    boundedString(parameters.target.assemblySha256, 'target.assemblySha256', 128);
    boundedString(parameters.target.proteinSha256, 'target.proteinSha256', 128);
    if (!Number.isInteger(parameters.target.annotationRevision) || parameters.target.annotationRevision < 0) {
      throw new TaskValidationError('Resolved CodeXomics target has an invalid annotationRevision');
    }
    if (!isSupportedGeneAnnotationFeatureType(parameters.target.featureType)) {
      throw new TaskValidationError(
        `Deep gene annotation research does not support target feature type "${parameters.target.featureType}"`,
      );
    }
    if (!hasStableGeneResearchIdentity(parameters.target)) {
      throw new TaskValidationError('Resolved annotation target must include a locusTag, proteinId, or geneSymbol');
    }

    const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
    if (parameters.target.organism && normalize(parameters.target.organism) !== normalize(parameters.organism)) {
      throw new TaskValidationError('Research organism does not match the organism resolved by CodeXomics');
    }
    if (parameters.target.geneSymbol && normalize(parameters.target.geneSymbol) !== normalize(parameters.geneSymbol)) {
      throw new TaskValidationError('Research geneSymbol does not match the feature resolved by CodeXomics');
    }
  }

  private async ensureRecovered() {
    if (!this.recoveryPromise) {
      this.recoveryPromise = taskStore.recoverInterruptedTasks()
        .then(async tasks => {
          for (const task of tasks) {
            try {
              this.validateParameters(task.parameters);
              if ((task.attempts ?? 0) >= this.maxAttempts) {
                await taskStore.updateTaskError(
                  task.id,
                  `Failed after ${task.attempts} durable attempts; execution budget was exhausted before restart`
                );
                continue;
              }
              if (!this.queue.some(queued => queued.id === task.id)) this.queue.push(task);
            } catch (error) {
              await taskStore.updateTaskError(
                task.id,
                `Recovered task failed validation: ${error instanceof Error ? error.message : 'invalid parameters'}`
              );
            }
          }
        })
        .catch(error => {
          // A transient storage error must not permanently poison this worker;
          // the next API call should be able to retry recovery.
          this.recoveryPromise = null;
          throw error;
        });
    }
    await this.recoveryPromise;
  }

  /** Start or resume the durable worker. Safe to call for every API request. */
  async start() {
    await this.ensureRecovered();
    void this.processQueue();
  }

  // 添加任务到队列
  async addTask(parameters: GeneResearchParameters): Promise<GeneResearchTask> {
    this.validateParameters(parameters);
    await this.start();
    const { task, created } = await taskStore.createOrGetTask(parameters);
    if (!created) {
      void this.processQueue();
      return task;
    }
    if (!this.queue.some(queued => queued.id === task.id) && !this.processingTasks.has(task.id)) {
      this.queue.push(task);
    }
    this.emit('task:created', task);
    void this.processQueue();
    return task;
  }

  // 处理队列
  private async processQueue() {
    await this.ensureRecovered();
    while (this.queue.length > 0 && this.processingTasks.size < this.maxConcurrent) {
      const task = this.queue.shift()!;
      if (this.processingTasks.has(task.id)) continue;
      this.processingTasks.add(task.id);
      void this.processTask(task)
        .catch(error => {
          console.error(`Unhandled queue error for task ${task.id}:`, error);
        })
        .finally(() => {
          this.processingTasks.delete(task.id);
          this.cancelledTasks.delete(task.id);
          this.abortControllers.delete(task.id);
          void this.processQueue();
        });
    }
  }

  private async isCancellationRequested(taskId: string): Promise<boolean> {
    if (this.cancelledTasks.has(taskId)) return true;
    const currentTask = await taskStore.getTask(taskId);
    return currentTask?.status === 'cancel_requested' || currentTask?.status === 'cancelled';
  }

  private async finishCancellation(task: GeneResearchTask, step: string) {
    const cancelledTask = await taskStore.updateTaskStatus(task.id, 'cancelled', undefined, step);
    if (cancelledTask.status === 'cancelled') {
      this.emit('task:cancelled', cancelledTask);
    }
    return cancelledTask;
  }

  private ensureCodeXomicsAnnotationProposal(task: GeneResearchTask, result: any) {
    if (task.parameters.includeCodeXomicsAnnotationProposal === false || !result || result.annotationProposal) {
      return result;
    }

    return {
      ...result,
      annotationProposal: buildCodeXomicsAnnotationProposal({
        geneSymbol: task.parameters.geneSymbol,
        organism: task.parameters.organism,
        target: task.parameters.target,
        currentAnnotation: task.parameters.currentAnnotation,
        finalReport: result.finalReport || result.report?.content || '',
        sources: result.sources || [],
        confidence:
          result.metadata?.confidence ??
          result.qualityMetrics?.overallQuality ??
          result.geneResearch?.qualityMetrics?.overallQuality ??
          null,
      }),
    };
  }

  private prepareResultForTask(task: GeneResearchTask, result: any) {
    if (!task.parameters.returnReportAsUrl && !task.parameters.returnDetailsAsUrl) {
      return result;
    }

    const reportContent = result.finalReport || result.report?.content || '';
    const researchId = storeResearchResult(reportContent, result);
    const download = {
      researchId,
      reportUrl: task.parameters.returnReportAsUrl
        ? formatMcpUrl(`/api/mcp/download/${researchId}/report`)
        : undefined,
      detailsUrl: task.parameters.returnDetailsAsUrl
        ? formatMcpUrl(`/api/mcp/download/${researchId}/details`)
        : undefined,
    };

    const responseResult: any = {
      ...result,
      download,
    };

    if (responseResult.annotationProposal) {
      responseResult.annotationProposal = {
        ...responseResult.annotationProposal,
        reportUrl: download.reportUrl || responseResult.annotationProposal.reportUrl,
        detailsUrl: download.detailsUrl || responseResult.annotationProposal.detailsUrl,
      };
    }

    // Keep the canonical report and workflow in the durable task record. URL
    // download helpers are convenience views and may expire; a task result is
    // the authoritative artifact used by CodeXomics recovery and audit.
    responseResult.artifactUri = `dgr://runs/${task.id}/result`;

    return responseResult;
  }

  // 处理单个任务（带重试机制）
  private async processTask(task: GeneResearchTask) {
    try {
      if (await this.isCancellationRequested(task.id)) {
        await this.finishCancellation(task, 'cancelled-before-start');
        return;
      }

      // Count and persist the complete execution attempt before cache or
      // provider activity. A process crash can therefore never reset retries.
      const startedTask = await taskStore.beginTaskAttempt(task.id, this.maxAttempts);
      if (startedTask.status !== 'in_progress') {
        await this.finishCancellation(startedTask, 'cancelled-before-research');
        return;
      }
      this.emit('task:started', startedTask);

      // A refresh request invalidates the semantic cache entry before any read.
      // forceRefresh itself is deliberately excluded from the cache key.
      let cachedResult: any | null = null;
      if (task.parameters.forceRefresh) {
        await cacheService.deleteCachedResult(task.parameters);
      } else {
        cachedResult = await cacheService.getCachedResult(task.parameters);
      }
      if (cachedResult && !isSubstantiveResearchResult(cachedResult, task.parameters)) {
        await cacheService.deleteCachedResult(task.parameters);
        cachedResult = null;
      }
      if (cachedResult) {
        if (await this.isCancellationRequested(task.id)) {
          await this.finishCancellation(task, 'cancelled-during-cache-check');
          return;
        }
        // 使用缓存结果
        const cacheCheckTask = await taskStore.updateTaskStatus(task.id, 'in_progress', 50, 'cache-check');
        if (cacheCheckTask.status !== 'in_progress') {
          await this.finishCancellation(cacheCheckTask, 'cancelled-during-cache-check');
          return;
        }
        this.emit('task:progress', cacheCheckTask, 50, 'cache-check');
        
        const cacheHitTask = await taskStore.updateTaskStatus(task.id, 'in_progress', 100, 'cache-hit');
        if (cacheHitTask.status !== 'in_progress') {
          await this.finishCancellation(cacheHitTask, 'cancelled-during-cache-hit');
          return;
        }
        this.emit('task:progress', cacheHitTask, 100, 'cache-hit');
        
        const policyCompliantCachedResult = enforceTaskMediaPolicy(task.parameters, cachedResult);
        const cachedResultWithProposal = this.ensureCodeXomicsAnnotationProposal(task, policyCompliantCachedResult);
        const taskResult = this.prepareResultForTask(task, cachedResultWithProposal);
        const completedTask = await taskStore.updateTaskResult(task.id, taskResult);
        if (completedTask.status === 'completed') {
          this.emit('task:completed', completedTask, taskResult);
        } else if (completedTask.status === 'cancel_requested') {
          await this.finishCancellation(completedTask, 'cancelled-during-cache-hit');
        }
        return;
      }

      // 初始化 DeepResearch 实例
      const { language, maxResult } = task.parameters;
      const deepResearch = initDeepResearchServer({ language, maxResult });
      const abortController = new AbortController();
      this.abortControllers.set(task.id, abortController);
      if (this.cancelledTasks.has(task.id)) abortController.abort();

      // 设置进度回调
      const originalOnMessage = deepResearch.onMessage;
      deepResearch.onMessage = (event, data) => {
        originalOnMessage(event, data);
        if (event === 'progress') {
          let progress = 0;
          const step = data.step;
          
          // 根据步骤计算进度
          switch (step) {
            case 'report-plan':
              progress = 20;
              break;
            case 'serp-query':
              progress = 40;
              break;
            case 'task-list':
              progress = 60;
              break;
            case 'search-task':
              // Individual search queries running (60-75%)
              progress = 60;
              break;
            case 'final-report':
              progress = 80;
              break;
            case 'gene-research':
              progress = 50;
              break;
            case 'gene-search':
              progress = 60;
              break;
          }

          if (data.status === 'end') {
            progress = step === 'final-report' || step === 'gene-research' ? 100 : progress + 10;
          }

          // 更新任务进度
          void taskStore.updateTaskStatus(task.id, 'in_progress', progress, step)
            .then((updatedTask) => {
              if (updatedTask.status === 'in_progress') {
                this.emit('task:progress', updatedTask, updatedTask.progress, step);
              }
            })
            .catch((error) => {
              console.error(`Failed to update progress for task ${task.id}:`, error);
            });
        }
      };

      // Build a user-facing query for the report, but pass the exact MCP
      // target into the specialized research engine. It must never recover a
      // gene symbol from free text when CodeXomics already resolved it.
      const { geneSymbol, organism, researchFocus = [], specificAspects = [], diseaseContext, experimentalApproach, userPrompt } = task.parameters;
      let baseQuery = `Gene research: ${geneSymbol} in ${organism}`;

      if (researchFocus.length > 0) {
        baseQuery += `\nFocus areas: ${researchFocus.join(', ')}`;
      }

      if (specificAspects.length > 0) {
        baseQuery += `\nSpecific aspects: ${specificAspects.join(', ')}`;
      }

      if (diseaseContext) {
        baseQuery += `\nDisease context: ${diseaseContext}`;
      }

      if (experimentalApproach) {
        baseQuery += `\nExperimental approach: ${experimentalApproach}`;
      }

      const query = userPrompt
        ? userPrompt.replace('{geneSymbol}', geneSymbol).replace('{organism}', organism)
        : `${baseQuery}\n\nResearch Question:\nWhat is the function, structure, and biological role of the gene ${geneSymbol} in ${organism}? Include information about its pathway, regulation, cofactors, substrates, products, and any recent research findings.${researchFocus.length ? ` Please specifically focus on: ${researchFocus.join(', ')}.` : ''
          }${specificAspects.length ? ` Investigate these specific aspects: ${specificAspects.join(', ')}.` : ''
          }`;

      const specializedResult = await deepResearch.conductGeneResearch(query, task.id, {
        geneSymbol,
        organism,
        target: task.parameters.target,
        currentAnnotation: task.parameters.currentAnnotation,
        researchFocus,
        specificAspects,
        diseaseContext,
        experimentalApproach,
      }, abortController.signal, task.parameters.enableCitationImage !== false);
      if (await this.isCancellationRequested(task.id)) {
        await this.finishCancellation(task, 'cancelled-during-research');
        return;
      }

      // Preserve the specialized engine's computed quality metrics instead of
      // publishing synthetic constants from the generic report pipeline.
      const researchTime = Date.now() - new Date(task.createdAt).getTime();
      const sourceCoverage = summarizeSourceCoverage([], specializedResult.sources || []);
      const searchDiagnostics = (specializedResult as any).metadata?.searchDiagnostics;
      if (searchDiagnostics) {
        sourceCoverage.searchTaskCount = searchDiagnostics.queryCount;
        sourceCoverage.tasksWithSources = searchDiagnostics.successfulSearches;
        sourceCoverage.sourceCount = searchDiagnostics.sourceCount;
        sourceCoverage.uniqueSourceCount = searchDiagnostics.uniqueSourceCount;
      }
      const result = enforceTaskMediaPolicy(task.parameters, {
        ...specializedResult,
        metadata: {
          ...((specializedResult as any).metadata || {}),
          researchTime,
          dataSources: sourceCoverage.sourceDomains,
          sourceCoverage,
        },
      });
      const resultWithProposal = this.ensureCodeXomicsAnnotationProposal(task, result);

      // 存储结果到缓存
      if (isSubstantiveResearchResult(resultWithProposal, task.parameters)) {
        await cacheService.setCachedResult(task.parameters, resultWithProposal);
      }

      if (await this.isCancellationRequested(task.id)) {
        await this.finishCancellation(task, 'cancelled-before-result-commit');
        return;
      }

      // 更新任务结果
      const taskResult = this.prepareResultForTask(task, resultWithProposal);
      const completedTask = await taskStore.updateTaskResult(task.id, taskResult);
      if (completedTask.status === 'completed') {
        this.emit('task:completed', completedTask, taskResult);
      } else if (completedTask.status === 'cancel_requested') {
        await this.finishCancellation(completedTask, 'cancelled-before-result-commit');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (await this.isCancellationRequested(task.id)) {
        await this.finishCancellation(task, 'cancelled-after-research-error');
        return;
      }
      
      // 检查是否需要重试
      const currentTask = await taskStore.getTask(task.id);
      const attempts = currentTask?.attempts ?? 0;
      if (attempts < this.maxAttempts) {
        const nextAttempt = attempts + 1;
        const delay = Math.pow(2, Math.max(0, attempts - 1)) * 1000; // 指数退避
        
        console.log(`Task ${task.id} failed, retrying in ${delay}ms (attempt ${nextAttempt}/${this.maxAttempts})`);
        
        // 更新任务状态为重试中
        const retryTask = await taskStore.updateTaskStatus(
          task.id, 
          'in_progress', 
          0, 
          `retry-${nextAttempt}`
        );
        if (retryTask.status !== 'in_progress') {
          await this.finishCancellation(retryTask, 'cancelled-before-retry');
          return;
        }
        this.emit('task:progress', retryTask, 0, `retry-${nextAttempt}`);
        
        // 延迟后重试
        await new Promise(resolve => setTimeout(resolve, delay));
        await this.processTask(task);
      } else {
        // 达到最大重试次数，标记任务失败
        const failedTask = await taskStore.updateTaskError(
          task.id,
          `Failed after ${attempts} attempts: ${errorMessage}`
        );
        if (failedTask.status === 'failed') {
          this.emit('task:failed', failedTask, errorMessage);
        }
      }
    }
  }

  // 获取队列状态
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processingCount: this.processingTasks.size,
      maxConcurrent: this.maxConcurrent
    };
  }

  // 取消任务
  async cancelTask(taskId: string): Promise<boolean> {
    await this.start();
    const task = await taskStore.getTask(taskId);
    if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) return false;

    const index = this.queue.findIndex(task => task.id === taskId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      const cancelledTask = await taskStore.updateTaskStatus(taskId, 'cancelled', 0, 'cancelled-in-queue');
      this.emit('task:cancelled', cancelledTask);
      return true;
    }
    this.cancelledTasks.add(taskId);
    this.abortControllers.get(taskId)?.abort();
    await taskStore.requestCancellation(taskId);
    return true;
  }

  // 设置最大并发数
  setMaxConcurrent(max: number) {
    this.maxConcurrent = this.normalizeConcurrency(max);
    void this.processQueue();
  }
}

// 导出单例实例
export const taskQueue = new TaskQueue();
