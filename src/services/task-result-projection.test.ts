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
});
