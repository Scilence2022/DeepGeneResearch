import { EventEmitter } from 'events';
import { GeneResearchTask, GeneResearchParameters } from '@/models/task';
import { taskStore } from './task-store';
import { initDeepResearchServer } from '@/app/api/mcp/server';
import { cacheService } from './cache';
import { storeResearchResult } from '@/utils/mcp-research-store';
import { buildCodeXomicsAnnotationProposal } from '@/utils/gene-research/codexomics-annotation';

const MCP_SERVER_BASE_URL = (process.env.MCP_SERVER_BASE_URL || '').trim().replace(/\/+$/, '');
const MCP_SEARCH_PROVIDER = process.env.MCP_SEARCH_PROVIDER || 'model';

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

// 任务队列类
class TaskQueue extends EventEmitter {
  private queue: GeneResearchTask[] = [];
  private isProcessing = false;
  private maxConcurrent = Math.max(1, Number(process.env.DGR_MAX_CONCURRENT_RESEARCH || 2));
  private processingTasks = new Set<string>();
  private cancelledTasks = new Set<string>();
  private recoveryPromise: Promise<void> | null = null;

  private async ensureRecovered() {
    if (!this.recoveryPromise) {
      this.recoveryPromise = taskStore.recoverInterruptedTasks().then(tasks => {
        for (const task of tasks) {
          if (!this.queue.some(queued => queued.id === task.id)) this.queue.push(task);
        }
      });
    }
    await this.recoveryPromise;
  }

  // 添加任务到队列
  async addTask(parameters: GeneResearchParameters): Promise<GeneResearchTask> {
    await this.ensureRecovered();
    const existing = await taskStore.findTaskByIdempotencyKey(parameters.idempotencyKey);
    if (existing) return existing;
    const task = await taskStore.createTask(parameters);
    this.queue.push(task);
    this.emit('task:created', task);
    this.processQueue();
    return task;
  }

  // 处理队列
  private async processQueue() {
    await this.ensureRecovered();
    if (this.isProcessing || this.queue.length === 0 || this.processingTasks.size >= this.maxConcurrent) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && this.processingTasks.size < this.maxConcurrent) {
        const task = this.queue.shift()!;
        this.processingTasks.add(task.id);
        this.processTask(task).finally(() => {
          this.processingTasks.delete(task.id);
          this.isProcessing = false;
          this.processQueue();
        });
      }
      // 如果队列已空，立即重置标志以便下一次处理
      // 注意：.finally() 中的 isProcessing = false 是针对异步任务完成的回调
      // 这里处理的是任务被取出但 while 循环正常退出的情况
      if (this.queue.length === 0) {
        this.isProcessing = false;
      }
    } catch (error) {
      console.error('Error processing queue:', error);
      this.isProcessing = false;
    }
  }

  // 最大重试次数
  private maxRetries = 3;

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
        finalReport: result.finalReport || result.report?.content || '',
        sources: result.sources || [],
        confidence: result.metadata?.confidence ?? result.qualityMetrics?.overallQuality ?? null,
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
  private async processTask(task: GeneResearchTask, attempt = 0) {
    try {
      if (this.cancelledTasks.has(task.id) || task.status === 'cancel_requested') {
        await taskStore.updateTaskStatus(task.id, 'cancelled', task.progress, 'cancelled-before-start');
        this.emit('task:cancelled', task);
        return;
      }
      // 检查缓存
      const cachedResult = await cacheService.getCachedResult(task.parameters);
      if (cachedResult) {
        // 使用缓存结果
        await taskStore.updateTaskStatus(task.id, 'in_progress', 50, 'cache-check');
        this.emit('task:progress', task, 50, 'cache-check');
        
        await taskStore.updateTaskStatus(task.id, 'in_progress', 100, 'cache-hit');
        this.emit('task:progress', task, 100, 'cache-hit');
        
        const cachedResultWithProposal = this.ensureCodeXomicsAnnotationProposal(task, cachedResult);
        const taskResult = this.prepareResultForTask(task, cachedResultWithProposal);
        await taskStore.updateTaskResult(task.id, taskResult);
        this.emit('task:completed', task, taskResult);
        return;
      }

      // 更新任务状态为进行中
      await taskStore.updateTaskStatus(task.id, 'in_progress', 0);
      this.emit('task:started', task);

      // 初始化 DeepResearch 实例
      const { language, maxResult } = task.parameters;
      const deepResearch = initDeepResearchServer({ language, maxResult });

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
          }

          if (data.status === 'end') {
            progress = step === 'final-report' || step === 'gene-research' ? 100 : progress + 10;
          }

          // 更新任务进度
          void taskStore.updateTaskStatus(task.id, 'in_progress', progress, step)
            .then((updatedTask) => {
              this.emit('task:progress', updatedTask, progress, step);
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
        researchFocus,
        specificAspects,
        diseaseContext,
        experimentalApproach,
      });
      if (this.cancelledTasks.has(task.id)) {
        await taskStore.updateTaskStatus(task.id, 'cancelled', 0, 'cancelled-during-research');
        this.emit('task:cancelled', task);
        return;
      }

      // Preserve the specialized engine's computed quality metrics instead of
      // publishing synthetic constants from the generic report pipeline.
      const researchTime = Date.now() - new Date(task.createdAt).getTime();
      const sourceCoverage = summarizeSourceCoverage([], specializedResult.sources || []);
      const result = {
        ...specializedResult,
        metadata: {
          ...((specializedResult as any).metadata || {}),
          researchTime,
          dataSources: sourceCoverage.sourceDomains,
          sourceCoverage,
        },
      };
      const resultWithProposal = this.ensureCodeXomicsAnnotationProposal(task, result);

      // 存储结果到缓存
      await cacheService.setCachedResult(task.parameters, resultWithProposal);

      // 更新任务结果
      const taskResult = this.prepareResultForTask(task, resultWithProposal);
      await taskStore.updateTaskResult(task.id, taskResult);
      this.emit('task:completed', task, taskResult);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // 检查是否需要重试
      if (attempt < this.maxRetries) {
        const nextAttempt = attempt + 1;
        const delay = Math.pow(2, attempt) * 1000; // 指数退避
        
        console.log(`Task ${task.id} failed, retrying in ${delay}ms (attempt ${nextAttempt}/${this.maxRetries})`);
        
        // 更新任务状态为重试中
        await taskStore.updateTaskStatus(
          task.id, 
          'in_progress', 
          0, 
          `retry-${nextAttempt}`
        );
        this.emit('task:progress', task, 0, `retry-${nextAttempt}`);
        
        // 延迟后重试
        await new Promise(resolve => setTimeout(resolve, delay));
        await this.processTask(task, nextAttempt);
      } else {
        // 达到最大重试次数，标记任务失败
        await taskStore.updateTaskError(task.id, `Failed after ${this.maxRetries} attempts: ${errorMessage}`);
        this.emit('task:failed', task, errorMessage);
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
    this.cancelledTasks.add(taskId);
    const index = this.queue.findIndex(task => task.id === taskId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      await taskStore.updateTaskStatus(taskId, 'cancelled', 0, 'cancelled-in-queue');
      return true;
    }
    const task = await taskStore.getTask(taskId);
    if (!task || ['completed', 'failed', 'cancelled'].includes(task.status)) return false;
    await taskStore.requestCancellation(taskId);
    return true;
  }

  // 设置最大并发数
  setMaxConcurrent(max: number) {
    this.maxConcurrent = max;
    this.processQueue();
  }
}

// 导出单例实例
export const taskQueue = new TaskQueue();
