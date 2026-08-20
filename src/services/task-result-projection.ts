import type { GeneResearchParameters } from '@/models/task';

export type TaskResultMode = 'full' | 'annotation';

/**
 * Defense-in-depth for clients that opt out of generated media. Older cached
 * results may still contain embedded SVG data, so enforce the policy again at
 * the durable queue boundary instead of relying only on generation settings.
 */
export function enforceTaskMediaPolicy(parameters: GeneResearchParameters, result: any): any {
  if (parameters.enableCitationImage !== false || !result || typeof result !== 'object') {
    return result;
  }

  const sanitized: any = {
    ...result,
    images: [],
  };
  if ('visualizations' in sanitized) sanitized.visualizations = [];
  if (sanitized.geneResearch && typeof sanitized.geneResearch === 'object') {
    sanitized.geneResearch = {
      ...sanitized.geneResearch,
      visualizations: [],
    };
  }
  if (sanitized.report?.sections && Array.isArray(sanitized.report.sections)) {
    sanitized.report = {
      ...sanitized.report,
      sections: sanitized.report.sections.map((section: any) => ({
        ...section,
        ...(Array.isArray(section?.visualizations) ? { visualizations: [] } : {}),
      })),
    };
  }
  return sanitized;
}

/** Return the compact contract needed by an annotation orchestrator. */
export function projectTaskResult(result: any, mode: TaskResultMode): any {
  if (mode === 'full' || !result || typeof result !== 'object') return result;

  const diagnostics = result.metadata?.searchDiagnostics;
  const metadata = result.metadata && typeof result.metadata === 'object'
    ? {
        researchTime: result.metadata.researchTime,
        dataSources: result.metadata.dataSources,
        sourceCoverage: result.metadata.sourceCoverage,
        confidence: result.metadata.confidence,
        // Accounting and coverage counters. An annotation orchestrator has to
        // report what a gene consumed and how much literature it saw; without
        // these it would have to re-read the whole multi-megabyte result to
        // find a handful of integers.
        llmUsage: result.metadata.llmUsage,
        llmSynthesis: result.metadata.llmSynthesis,
        literatureMetrics: result.metadata.literatureMetrics,
        cacheReplay: result.metadata.cacheReplay,
        // Only the coverage sub-object: `attempts` is unbounded and would
        // defeat the purpose of a compact projection.
        searchDiagnostics: diagnostics?.literatureCoverage
          ? { literatureCoverage: diagnostics.literatureCoverage }
          : undefined,
      }
    : undefined;

  return {
    annotationProposal: result.annotationProposal,
    // The mutation-ready Note is the payload a curator reviews, and it is
    // bounded by construction.
    annotationNote: result.annotationNote,
    artifactUri: result.artifactUri,
    download: result.download,
    title: result.title,
    metadata,
    qualityMetrics: result.qualityMetrics ?? result.geneResearch?.qualityMetrics,
  };
}
