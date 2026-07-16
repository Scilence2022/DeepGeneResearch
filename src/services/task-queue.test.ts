import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildExactAnnotationFieldEvidence } from '@/utils/gene-research/current-annotation';

const originalWorkerCount = process.env.DGR_WORKER_COUNT;
const originalWebConcurrency = process.env.WEB_CONCURRENCY;

describe.sequential('durable task queue lifecycle', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'dgr-task-queue-'));
    process.env.MCP_TASK_STORAGE_FILE = path.join(directory, 'tasks.json');
    delete process.env.VERCEL;
    delete process.env.CF_PAGES;
    delete process.env.DGR_WORKER_COUNT;
    delete process.env.WEB_CONCURRENCY;
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.MCP_TASK_STORAGE_FILE;
    if (originalWorkerCount === undefined) delete process.env.DGR_WORKER_COUNT;
    else process.env.DGR_WORKER_COUNT = originalWorkerCount;
    if (originalWebConcurrency === undefined) delete process.env.WEB_CONCURRENCY;
    else process.env.WEB_CONCURRENCY = originalWebConcurrency;
    vi.doUnmock('@/app/api/mcp/server');
    vi.doUnmock('@/services/cache');
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  function mockResearch(conductGeneResearch: (...args: any[]) => Promise<any>) {
    vi.doMock('@/app/api/mcp/server', () => ({
      initDeepResearchServer: () => ({
        onMessage: () => undefined,
        conductGeneResearch,
      }),
    }));
    vi.doMock('@/services/cache', () => ({
      cacheService: {
        getCachedResult: vi.fn().mockResolvedValue(null),
        setCachedResult: vi.fn().mockResolvedValue(undefined),
        deleteCachedResult: vi.fn().mockResolvedValue(false),
      },
      isReusableResearchResult: vi.fn().mockReturnValue(false),
    }));
  }

  it('automatically processes work recovered from an interrupted process', async () => {
    const { taskStore: initialStore } = await import('./task-store');
    const interrupted = await initialStore.createTask({
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
      idempotencyKey: 'recover-run',
    });
    await initialStore.updateTaskStatus(interrupted.id, 'in_progress', 40, 'interrupted');

    vi.resetModules();
    mockResearch(async () => ({ finalReport: 'Recovered research report.', sources: [] }));
    const { TaskQueue } = await import('./task-queue');
    const { taskStore } = await import('./task-store');
    const queue = new TaskQueue();
    await queue.start();

    await vi.waitFor(async () => {
      expect((await taskStore.getTask(interrupted.id))?.status).toBe('completed');
    });
    await vi.waitFor(() => expect(queue.getQueueStatus().processingCount).toBe(0));
    expect((await taskStore.getTask(interrupted.id))?.attempts).toBe(1);
  });

  it('does not invoke providers after a recovered task exhausts its durable attempt budget', async () => {
    const { taskStore: initialStore } = await import('./task-store');
    const interrupted = await initialStore.createTask({
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await initialStore.beginTaskAttempt(interrupted.id, 4);
    }

    vi.resetModules();
    const research = vi.fn().mockResolvedValue({ finalReport: 'must not run', sources: [] });
    mockResearch(research);
    const { TaskQueue } = await import('./task-queue');
    const { taskStore } = await import('./task-store');
    const queue = new TaskQueue();
    await queue.start();

    await vi.waitFor(async () => {
      expect((await taskStore.getTask(interrupted.id))?.status).toBe('failed');
    });
    expect(research).not.toHaveBeenCalled();
    expect((await taskStore.getTask(interrupted.id))?.error).toContain('4 durable attempts');
  });

  it('cooperatively aborts a running task and keeps cancellation terminal', async () => {
    let researchSignal!: AbortSignal;
    mockResearch((_query, _taskId, _geneInfo, signal: AbortSignal) => new Promise((_resolve, reject) => {
      researchSignal = signal;
      signal.addEventListener('abort', () => reject(signal.reason));
    }));
    const { TaskQueue } = await import('./task-queue');
    const { taskStore } = await import('./task-store');
    const queue = new TaskQueue();
    const task = await queue.addTask({ geneSymbol: 'thrL', organism: 'Escherichia coli' });

    await vi.waitFor(async () => {
      expect((await taskStore.getTask(task.id))?.status).toBe('in_progress');
    });
    expect(await queue.cancelTask(task.id)).toBe(true);

    await vi.waitFor(async () => {
      expect((await taskStore.getTask(task.id))?.status).toBe('cancelled');
    });
    await vi.waitFor(() => expect(queue.getQueueStatus().processingCount).toBe(0));
    expect(researchSignal.aborted).toBe(true);
    expect((await taskStore.getTask(task.id))?.result).toBeUndefined();
  });

  it('rejects a research request that conflicts with its immutable target', async () => {
    mockResearch(async () => ({ finalReport: 'unused', sources: [] }));
    const { TaskQueue } = await import('./task-queue');
    const queue = new TaskQueue();

    await expect(queue.addTask({
      geneSymbol: 'lacZ',
      organism: 'Escherichia coli',
      target: {
        workspaceId: 'ws_a',
        genomeId: 'genome_a',
        annotationRevision: 1,
        featureId: 'feature_a',
        featureHash: 'hash_a',
        chromosome: 'NC_000913.3',
        featureType: 'CDS',
        locusTag: 'b0001',
        geneSymbol: 'thrL',
        organism: 'Escherichia coli',
      },
    })).rejects.toThrow('Research geneSymbol does not match');
  });

  it('rejects non-CDS and unstable external annotation targets', async () => {
    mockResearch(async () => ({ finalReport: 'unused', sources: [] }));
    const { TaskQueue } = await import('./task-queue');
    const queue = new TaskQueue();
    const baseTarget = {
      workspaceId: 'ws_a',
      genomeId: 'genome_a',
      annotationRevision: 1,
      featureId: 'feature_a',
      featureHash: 'hash_a',
      chromosome: 'NC_000913.3',
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
    };

    await expect(queue.addTask({
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
      target: { ...baseTarget, featureType: 'tRNA', locusTag: 'b0001' },
    })).rejects.toThrow('restricted to resolved CDS targets');

    await expect(queue.addTask({
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
      target: { ...baseTarget, featureType: 'CDS' },
    })).rejects.toThrow('stable locusTag or proteinId');
  });

  it('retries recovery after a transient task-store failure', async () => {
    mockResearch(async () => ({ finalReport: 'unused', sources: [] }));
    const { taskStore } = await import('./task-store');
    const recovery = vi.spyOn(taskStore, 'recoverInterruptedTasks')
      .mockRejectedValueOnce(new Error('transient storage failure'))
      .mockResolvedValueOnce([]);
    const { TaskQueue } = await import('./task-queue');
    const queue = new TaskQueue();

    await expect(queue.start()).rejects.toThrow('transient storage failure');
    await expect(queue.start()).resolves.toBeUndefined();
    expect(recovery).toHaveBeenCalledTimes(2);
  });

  it('carries specialized gene-research confidence into the annotation proposal', async () => {
    mockResearch(async () => ({
      finalReport: 'PMID:12345678 supports GO:0000001.',
      sources: [{ pmid: '12345678', content: 'GO:0000001' }],
      geneResearch: { qualityMetrics: { overallQuality: 0.73 } },
    }));
    const { TaskQueue } = await import('./task-queue');
    const { taskStore } = await import('./task-store');
    const queue = new TaskQueue();
    const task = await queue.addTask({ geneSymbol: 'thrL', organism: 'Escherichia coli' });

    await vi.waitFor(async () => {
      expect((await taskStore.getTask(task.id))?.status).toBe('completed');
    });
    expect((await taskStore.getTask(task.id))?.result.annotationProposal.confidence).toBe(0.73);
    await vi.waitFor(() => expect(queue.getQueueStatus().processingCount).toBe(0));
  });

  it('carries the resolved qualifier snapshot through research into conservative product refinement', async () => {
    const exactTarget = {
      workspaceId: 'ws_a',
      genomeId: 'genome_a',
      annotationRevision: 5,
      featureId: 'feature_thrB',
      featureHash: 'hash_thrB',
      chromosome: 'NC_000913.3',
      featureType: 'CDS',
      locusTag: 'b0003',
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
    } as const;
    const sourceId = 'UniProtKB:P00547';
    const sourceUrl = 'https://www.uniprot.org/uniprotkb/P00547/entry';
    const research = vi.fn(async (_query, _taskId, geneInfo) => {
      const fieldEvidence = buildExactAnnotationFieldEvidence({
        annotation: { product: 'Homoserine kinase' },
        currentAnnotation: geneInfo.currentAnnotation,
        sourceId,
        database: 'uniprot',
        url: sourceUrl,
        retrievedAt: '2026-07-16T00:00:00.000Z',
      });
      return {
        finalReport: 'Reviewed exact-target protein identity.',
        sources: [{
          title: 'Reviewed homoserine kinase record',
          sourceId,
          url: sourceUrl,
          database: 'uniprot',
          authoritative: true,
          targetMatch: true,
          target: geneInfo.target,
          annotation: {
            product: 'Homoserine kinase',
            reviewed: true,
            ...(fieldEvidence ? { fieldEvidence } : {}),
          },
        }],
      };
    });
    mockResearch(research);
    const { TaskQueue } = await import('./task-queue');
    const { taskStore } = await import('./task-store');
    const queue = new TaskQueue();

    const placeholderTask = await queue.addTask({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target: exactTarget,
      currentAnnotation: { product: 'hypothetical protein' },
    });
    await vi.waitFor(async () => {
      expect((await taskStore.getTask(placeholderTask.id))?.status).toBe('completed');
    });
    const placeholderProposal = (await taskStore.getTask(placeholderTask.id))?.result.annotationProposal;
    expect(research.mock.calls[0][2].currentAnnotation).toEqual({ product: 'hypothetical protein' });
    expect(placeholderProposal.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        op: 'replaceQualifier',
        field: 'product',
        value: 'Homoserine kinase',
      }),
    ]));

    const specificTask = await queue.addTask({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target: exactTarget,
      currentAnnotation: { product: 'Threonine-pathway homoserine kinase' },
    });
    const missingTask = await queue.addTask({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target: exactTarget,
    });
    await vi.waitFor(async () => {
      expect((await taskStore.getTask(specificTask.id))?.status).toBe('completed');
      expect((await taskStore.getTask(missingTask.id))?.status).toBe('completed');
    });
    for (const taskId of [specificTask.id, missingTask.id]) {
      const proposal = (await taskStore.getTask(taskId))?.result.annotationProposal;
      expect(proposal.operations.some((operation: any) => operation.field === 'product')).toBe(false);
    }
    await vi.waitFor(() => expect(queue.getQueueStatus().processingCount).toBe(0));
  });

  it('disables generated visualizations and strips legacy media from the durable result', async () => {
    const research = vi.fn().mockResolvedValue({
      finalReport: 'Research report.',
      sources: [],
      images: [{ url: 'data:image/svg+xml;base64,AAAA' }],
      geneResearch: {
        visualizations: [{ content: '<svg />' }],
        qualityMetrics: { overallQuality: 0.7 },
      },
    });
    mockResearch(research);
    const { TaskQueue } = await import('./task-queue');
    const { taskStore } = await import('./task-store');
    const queue = new TaskQueue();
    const task = await queue.addTask({
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
      enableCitationImage: false,
    });

    await vi.waitFor(async () => {
      expect((await taskStore.getTask(task.id))?.status).toBe('completed');
    });
    const completed = await taskStore.getTask(task.id);
    expect(research.mock.calls[0][4]).toBe(false);
    expect(completed?.result.images).toEqual([]);
    expect(completed?.result.geneResearch.visualizations).toEqual([]);
  });

  it('rejects unbounded agent inputs before they reach the durable queue', async () => {
    mockResearch(async () => ({ finalReport: 'unused', sources: [] }));
    const { TaskQueue, TaskValidationError } = await import('./task-queue');
    const queue = new TaskQueue();
    const base = { geneSymbol: 'thrL', organism: 'Escherichia coli' };

    await expect(queue.addTask({ ...base, maxResult: 21 })).rejects.toBeInstanceOf(TaskValidationError);
    await expect(queue.addTask({ ...base, userPrompt: 'x'.repeat(8_001) })).rejects.toBeInstanceOf(TaskValidationError);
    await expect(queue.addTask({ ...base, researchFocus: Array(21).fill('function') }))
      .rejects.toBeInstanceOf(TaskValidationError);
    await expect(queue.addTask({ ...base, forceRefresh: 'yes' } as any))
      .rejects.toBeInstanceOf(TaskValidationError);
    await expect(queue.addTask({ ...base, currentAnnotation: { product: 'hypothetical protein' } }))
      .rejects.toThrow('requires an exact resolved CodeXomics target');
    await expect(queue.addTask({
      ...base,
      target: {
        workspaceId: 'ws_a', genomeId: 'genome_a', annotationRevision: 1,
        featureId: 'feature_a', featureHash: 'hash_a', chromosome: 'NC_000913.3',
        featureType: 'CDS', locusTag: 'b0001', geneSymbol: 'thrL', organism: 'Escherichia coli',
      },
      currentAnnotation: { product: 'x'.repeat(1_025) },
    })).rejects.toBeInstanceOf(TaskValidationError);
    await expect(queue.addTask({
      ...base,
      target: {
        workspaceId: 'ws_a', genomeId: 'genome_a', annotationRevision: 1,
        featureId: 'feature_a', featureHash: 'hash_a', chromosome: 'NC_000913.3',
        featureType: 'CDS', locusTag: 'b0001', geneSymbol: 'thrL', organism: 'Escherichia coli',
      },
      currentAnnotation: { note: 'untrusted free text' } as any,
    })).rejects.toThrow('must contain at most 32 items');
    await expect(queue.addTask({
      ...base,
      target: {
        workspaceId: 'ws_a', genomeId: 'genome_a', annotationRevision: 1,
        featureId: 'feature_a', featureHash: 'hash_a', chromosome: 'NC_000913.3',
        featureType: 'CDS', locusTag: 'b0001', geneSymbol: 'thrL', organism: 'Escherichia coli',
      },
      currentAnnotation: { unsupported: ['untrusted'] } as any,
    })).rejects.toThrow('not an allowed qualifier');
  });
});
