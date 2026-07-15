import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { GeneResearchParameters } from '@/models/task';

const target = {
  workspaceId: 'ws_ecoli',
  genomeId: 'genome_ecoli',
  annotationRevision: 2,
  featureId: 'feat_thrB',
  featureHash: 'feature-hash-thrB',
  chromosome: 'NC_000913.3',
  geneSymbol: 'thrB',
  organism: 'Escherichia coli',
};

function result(label: string) {
  return {
    title: `${label} thrB research`,
    finalReport: `${label}: Escherichia coli thrB encodes homoserine kinase, EC 2.7.1.39, in threonine biosynthesis.`,
    sources: [
      {
        database: 'pubmed',
        pmid: '8660667',
        url: 'https://pubmed.ncbi.nlm.nih.gov/8660667/',
        content: 'Experimental characterization demonstrates that Escherichia coli ThrB is homoserine kinase and catalyzes ATP-dependent phosphorylation of L-homoserine.',
      },
      {
        database: 'uniprot',
        url: 'https://www.uniprot.org/uniprotkb/P00547/entry',
        content: 'The reviewed protein record identifies Escherichia coli ThrB as homoserine kinase EC 2.7.1.39 and associates it with the threonine biosynthetic pathway.',
      },
    ],
    metadata: { searchDiagnostics: { queryCount: 4, successfulSearches: 2, sourceCount: 2, uniqueSourceCount: 2 } },
    annotationProposal: {
      target,
      baseRevision: target.annotationRevision,
      operations: [],
    },
  };
}

describe.sequential('task queue research cache controls', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'dgr-task-cache-'));
    process.env.MCP_TASK_STORAGE_FILE = path.join(directory, 'tasks.json');
    delete process.env.VERCEL;
    delete process.env.CF_PAGES;
    process.env.DGR_WORKER_COUNT = '1';
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.MCP_TASK_STORAGE_FILE;
    delete process.env.DGR_WORKER_COUNT;
    vi.doUnmock('@/app/api/mcp/server');
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('deletes and bypasses a reusable entry when forceRefresh is true', async () => {
    const request: GeneResearchParameters = {
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      forceRefresh: true,
    };
    const { cacheService } = await import('./cache');
    await cacheService.clearAllCache();
    await cacheService.setCachedResult({ ...request, forceRefresh: false }, result('old'));
    expect((await cacheService.getCacheStats()).totalItems).toBe(1);
    const deleteCachedResult = vi.spyOn(cacheService, 'deleteCachedResult');

    const conductGeneResearch = vi.fn().mockResolvedValue(result('fresh'));
    vi.doMock('@/app/api/mcp/server', () => ({
      initDeepResearchServer: () => ({
        onMessage: () => undefined,
        conductGeneResearch,
      }),
    }));

    const { TaskQueue } = await import('./task-queue');
    const { taskStore } = await import('./task-store');
    const queue = new TaskQueue();
    const task = await queue.addTask(request);

    await vi.waitFor(async () => {
      expect((await taskStore.getTask(task.id))?.status).toBe('completed');
    });
    await vi.waitFor(() => expect(queue.getQueueStatus().processingCount).toBe(0));

    expect(deleteCachedResult).toHaveBeenCalledOnce();
    expect(conductGeneResearch).toHaveBeenCalledOnce();
    expect((await taskStore.getTask(task.id))?.result.finalReport).toContain('fresh:');
    expect((await cacheService.getCachedResult({ ...request, forceRefresh: false }))?.finalReport)
      .toContain('fresh:');
  });
});
