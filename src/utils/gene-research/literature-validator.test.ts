import { describe, expect, it } from 'vitest';
import { LiteratureValidator, type EnhancedLiteratureReference } from './literature-validator';

function reference(pmid: string, confidenceScore: number): EnhancedLiteratureReference {
  return {
    pmid,
    title: `Reference ${pmid}`,
    authors: ['A. Curator'],
    journal: 'Genome Biology',
    year: 2024,
    abstract: 'Validated reference fixture.',
    relevance: 'high',
    studyType: 'experimental',
    organism: 'Escherichia coli',
    methodology: [],
    qualityMetadata: {
      verified: confidenceScore >= 0.7,
      verificationMethod: 'manual_review',
      confidenceScore,
      warningFlags: [],
    },
  };
}

describe('LiteratureValidator', () => {
  it('deduplicates references by stable PMID and retains the stronger validated record', () => {
    const validator = new LiteratureValidator();
    const weaker = reference('12345678', 0.4);
    const stronger = { ...reference('12345678', 0.9), title: 'Preferred reference' };

    const result = validator.deduplicateReferences([weaker, stronger]);

    expect(result.duplicateCount).toBe(1);
    expect(result.uniqueReferences).toHaveLength(1);
    expect(result.uniqueReferences[0].title).toBe('Preferred reference');
  });

  it('reports high-confidence references on the validator\'s 0-to-1 confidence scale', () => {
    const validator = new LiteratureValidator();
    const result = validator.deduplicateReferences([reference('11111111', 0.8), reference('22222222', 0.2)]);

    expect(result.stats.validated).toBe(1);
    expect(result.stats.highConfidence).toBe(1);
  });
});
