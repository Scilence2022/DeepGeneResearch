import { EventEmitter } from 'events';
import { GeneResearchTask, GeneResearchParameters } from '@/models/task';
import { taskStore } from './task-store';
import { initDeepResearchServer } from '@/app/api/mcp/server';
import { cacheService } from './cache';

// 任务队列类
class TaskQueue extends EventEmitter {
  private queue: GeneResearchTask[] = [];
  private isProcessing = false;
  private maxConcurrent = 1; // 最大并发任务数
  private processingTasks = new Set<string>();

  // 添加任务到队列
  async addTask(parameters: GeneResearchParameters): Promise<GeneResearchTask> {
    const task = await taskStore.createTask(parameters);
    this.queue.push(task);
    this.emit('task:created', task);
    this.processQueue();
    return task;
  }

  // 处理队列
  private async processQueue() {
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

  // 处理单个任务（带重试机制）
  private async processTask(task: GeneResearchTask, attempt = 0) {
    try {
      // 检查缓存
      const cachedResult = await cacheService.getCachedResult(task.parameters);
      if (cachedResult) {
        // 使用缓存结果
        await taskStore.updateTaskStatus(task.id, 'in_progress', 50, 'cache-check');
        this.emit('task:progress', task, 50, 'cache-check');
        
        await taskStore.updateTaskStatus(task.id, 'in_progress', 100, 'cache-hit');
        this.emit('task:progress', task, 100, 'cache-hit');
        
        await taskStore.updateTaskResult(task.id, cachedResult);
        this.emit('task:completed', task, cachedResult);
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
          taskStore.updateTaskStatus(task.id, 'in_progress', progress, step);
          this.emit('task:progress', task, progress, step);
        }
      };

      // 构建查询
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

      // 执行研究流程
      const reportPlan = await deepResearch.writeReportPlan(query);
      const queries = await deepResearch.generateSERPQuery(reportPlan);
      const searchResults = await deepResearch.runSearchTask(queries, task.parameters.enableReferences);
      const report = await deepResearch.writeFinalReport(
        reportPlan,
        searchResults,
        task.parameters.enableCitationImage,
        task.parameters.enableReferences
      );

      // 格式化结果
      const researchTime = Date.now() - new Date(task.createdAt).getTime();
      const result = {
        workflow: {
          geneIdentification: {
            geneSymbol,
            organism,
            researchFocus,
            specificAspects
          },
          researchPlan: reportPlan,
          searchTasks: queries,
          searchResults: searchResults
        },
        qualityMetrics: {
          dataCompleteness: searchResults.length > 0 ? 0.8 : 0,
          literatureCoverage: searchResults.reduce((sum, t) => sum + (t.sources?.length || 0), 0) > 0 ? 0.9 : 0,
          experimentalEvidence: 0.7,
          crossSpeciesValidation: 0.6,
          databaseConsistency: 0.8,
          overallQuality: searchResults.length > 0 ? 0.75 : 0.2
        },
        visualizations: [],
        report: {
          title: `Gene Research Report: ${geneSymbol} in ${organism}`,
          content: report.finalReport,
          sections: []
        },
        metadata: {
          researchTime,
          dataSources: ['searxng', 'pubmed', 'ncbi', 'kegg', 'string'],
          confidence: searchResults.length > 0 ? 0.75 : 0.2,
          completeness: searchResults.length > 0 ? 0.8 : 0
        },
        finalReport: report.finalReport,
        sources: report.sources || [],
        images: report.images || []
      };

      // 处理 URL 输出选项
      if (task.parameters.returnReportAsUrl || task.parameters.returnDetailsAsUrl) {
        // 这里可以添加文件存储逻辑
        // 暂时返回原始结果
      }

      // 存储结果到缓存
      await cacheService.setCachedResult(task.parameters, result);

      // 更新任务结果
      await taskStore.updateTaskResult(task.id, result);
      this.emit('task:completed', task, result);
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
  cancelTask(taskId: string): boolean {
    const index = this.queue.findIndex(task => task.id === taskId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    return false;
  }

  // 设置最大并发数
  setMaxConcurrent(max: number) {
    this.maxConcurrent = max;
    this.processQueue();
  }
}

// 导出单例实例
export const taskQueue = new TaskQueue();
