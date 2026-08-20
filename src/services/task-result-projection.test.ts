import { describe, expect, it } from 'vitest';
import { enforceTaskMediaPolicy, projectTaskResult } from './task-result-projection';

describe('task result output policies', () => {
  it('removes embedded visualizations when citation images are disabled', () => {
    const result = enforceTaskMediaPolicy(
      { geneSymbol: 'thrL', organism: 'Escherichia coli', enableCitationImage: false },
      {
        images: [{ url: `data:image/svg+xml;base64,${'A'.repeat(10_000)}` }],
        visualizations: [{ content: '<svg />' }],
        geneResearch: { visualizations: [{ content: '<svg />' }], qualityMetrics: { overallQuality: 0.8 } },
        report: { sections: [{ content: 'text', visualizations: [{ content: '<svg />' }] }] },
      }
    );

    expect(result.images).toEqual([]);
    expect(result.visualizations).toEqual([]);
    expect(result.geneResearch.visualizations).toEqual([]);
    expect(result.report.sections[0].visualizations).toEqual([]);
  });

  it('projects a bounded annotation result without reports, sources, workflows, or images', () => {
    const result = {
      annotationProposal: { schema: 'codexomics.annotation-change-set.v2', operations: [] },
      artifactUri: 'dgr://runs/run-a/result',
      download: { reportUrl: 'https://example.test/report' },
      title: 'thrL report',
      finalReport: 'large report'.repeat(10_000),
      sources: [{ content: 'large source'.repeat(10_000) }],
      images: [{ url: `data:image/svg+xml;base64,${'A'.repeat(100_000)}` }],
      metadata: { researchTime: 10, dataSources: ['pubmed'], sourceCoverage: { sourceCount: 1 } },
      geneResearch: {
        qualityMetrics: { overallQuality: 0.8 },
        workflow: { large: 'workflow'.repeat(10_000) },
      },
    };

    const projection = projectTaskResult(result, 'annotation');
    const serialized = JSON.stringify(projection);

    expect(projection.annotationProposal).toEqual(result.annotationProposal);
    expect(projection.qualityMetrics).toEqual({ overallQuality: 0.8 });
    expect(serialized).not.toContain('data:image');
    expect(serialized).not.toContain('large report');
    expect(serialized).not.toContain('large source');
    expect(serialized).not.toContain('workflowworkflow');
  });

  it('keeps the accounting and coverage counters an orchestrator has to report', () => {
    const llmUsage = {
      calls: 3,
      promptTokens: 120_000,
      cachedPromptTokens: 40_000,
      completionTokens: 9_000,
      totalTokens: 129_000,
      phases: {
        'gene-llm-report': {
          calls: 1,
          promptTokens: 8_000,
          cachedPromptTokens: 0,
          completionTokens: 2_600,
          totalTokens: 10_600,
        },
      },
      models: {
        'deepseek-v4-pro': {
          calls: 3,
          promptTokens: 120_000,
          cachedPromptTokens: 40_000,
          completionTokens: 9_000,
          totalTokens: 129_000,
          phases: {},
        },
      },
    };
    const literatureCoverage = {
      literatureBudget: 300,
      pubmedTotalMatchCount: 812,
      retainedAbstractCount: 300,
    };

    const projection = projectTaskResult(
      {
        annotationProposal: { operations: [] },
        annotationNote: {
          text: 'Aspartate kinase III [PMID:12345678]',
          segments: [{ citations: ['12345678'] }],
        },
        metadata: {
          researchTime: 640_200,
          cacheReplay: true,
          llmUsage,
          llmSynthesis: { literatureLearningBatches: 4 },
          literatureMetrics: { totalPapers: 300 },
          searchDiagnostics: {
            queryCount: 16,
            literatureCoverage,
            attempts: [{ query: 'huge'.repeat(10_000) }],
          },
        },
      },
      'annotation'
    );

    expect(projection.metadata.llmUsage).toEqual(llmUsage);
    expect(projection.metadata.llmSynthesis).toEqual({ literatureLearningBatches: 4 });
    expect(projection.metadata.literatureMetrics).toEqual({ totalPapers: 300 });
    expect(projection.metadata.cacheReplay).toBe(true);
    expect(projection.metadata.searchDiagnostics).toEqual({ literatureCoverage });
    expect(projection.annotationNote.text).toContain('PMID:12345678');
    // `attempts` is unbounded and must not survive a projection whose purpose
    // is to stay small.
    expect(JSON.stringify(projection)).not.toContain('hugehuge');
  });

  it('omits searchDiagnostics entirely when there is no coverage audit to carry', () => {
    const projection = projectTaskResult(
      { metadata: { researchTime: 1, searchDiagnostics: { attempts: [{ query: 'x' }] } } },
      'annotation'
    );
    expect(projection.metadata.searchDiagnostics).toBeUndefined();
  });
});
