import { afterEach, describe, expect, it } from 'vitest';
import type { GeneResearchParameters } from '@/models/task';
import {
  buildCacheKeyPayload,
  cacheService,
  generateCacheKey,
  isReusableResearchResult,
  stableSerialize,
} from './cache';

const target = {
  workspaceId: 'ws_ecoli',
  genomeId: 'genome_ecoli',
  annotationRevision: 4,
  featureId: 'feat_thrB',
  featureHash: 'feature-hash-thrB',
  chromosome: 'NC_000913.3',
  featureType: 'CDS',
  locusTag: 'b0003',
  geneSymbol: 'thrB',
  organism: 'Escherichia coli',
};

function parameters(overrides: Partial<GeneResearchParameters> = {}): GeneResearchParameters {
  return {
    geneSymbol: 'thrB',
    organism: 'Escherichia coli',
    researchFocus: ['function', 'pathway'],
    specificAspects: ['EC number', 'protein family'],
    target,
    ...overrides,
  };
}

function substantiveResult(label = 'cached') {
  return {
    finalReport: `${label}: thrB encodes homoserine kinase (EC 2.7.1.39) in the threonine biosynthesis pathway.`,
    sources: [
      {
        database: 'pubmed',
        pmid: '8660667',
        url: 'https://pubmed.ncbi.nlm.nih.gov/8660667/',
        content: 'Functional characterization established that Escherichia coli ThrB is homoserine kinase and catalyzes ATP-dependent phosphorylation of L-homoserine to O-phosphohomoserine.',
        provenance: { provider: 'pubmed', recordId: '8660667' },
        structuredData: { targetRelevance: { accepted: true } },
      },
      {
        database: 'uniprot',
        url: 'https://www.uniprot.org/uniprotkb/P00547/entry',
        content: 'The reviewed UniProt record identifies ThrB as homoserine kinase, assigns EC 2.7.1.39, and places the enzyme in threonine amino-acid biosynthesis in Escherichia coli.',
        authoritative: true,
        targetMatch: true,
      },
    ],
    metadata: { searchDiagnostics: { successfulSearches: 2 } },
    annotationProposal: {
      target,
      baseRevision: target.annotationRevision,
      operations: [],
    },
  };
}

afterEach(async () => {
  await cacheService.clearAllCache();
});

describe('semantic research cache keys', () => {
  it('recursively canonicalizes nested objects and unordered research aspects', () => {
    const left = parameters();
    const right = parameters({
      researchFocus: ['pathway', 'function'],
      specificAspects: ['protein family', 'EC number'],
      target: {
        chromosome: target.chromosome,
        featureHash: target.featureHash,
        featureId: target.featureId,
        annotationRevision: target.annotationRevision,
        genomeId: target.genomeId,
        workspaceId: target.workspaceId,
        organism: target.organism,
        geneSymbol: target.geneSymbol,
        featureType: target.featureType,
        locusTag: target.locusTag,
      },
    });

    expect(generateCacheKey(left)).toBe(generateCacheKey(right));
    expect(stableSerialize(buildCacheKeyPayload(left)))
      .toBe(stableSerialize(buildCacheKeyPayload(right)));
  });

  it('excludes transport and refresh controls from the semantic key', () => {
    const base = parameters();
    const controls = parameters({
      idempotencyKey: 'request-a',
      correlationId: 'trace-a',
      forceRefresh: true,
      returnReportAsUrl: true,
      returnDetailsAsUrl: true,
    });

    expect(generateCacheKey(base)).toBe(generateCacheKey(controls));
  });

  it('changes when pipeline or relevant provider configuration changes', () => {
    const request = parameters();
    const baseContext = {
      pipelineVersion: '0.22.0',
      searchProvider: 'searxng',
      searchBaseURL: 'http://searx-a.test',
      searchScope: 'academic',
    };

    expect(generateCacheKey(request, baseContext)).not.toBe(generateCacheKey(request, {
      ...baseContext,
      pipelineVersion: '0.23.0',
    }));
    expect(generateCacheKey(request, baseContext)).not.toBe(generateCacheKey(request, {
      ...baseContext,
      searchBaseURL: 'http://searx-b.test',
    }));
    expect(generateCacheKey(request, baseContext)).not.toBe(generateCacheKey(request, {
      ...baseContext,
      searchScope: 'general',
    }));
  });

  it('includes a canonical current annotation snapshot in semantic cache identity', () => {
    const placeholder = parameters({
      currentAnnotation: {
        product: 'Hypothetical   protein',
        note: ['Existing evidence summary. PMID:38253429'],
        go_terms: ['GO:0004413', 'GO:0008152'],
      },
    });
    const equivalent = parameters({
      currentAnnotation: {
        go_terms: ['GO:0008152', 'GO:0004413'],
        note: [' existing evidence summary.   pmid:38253429 '],
        product: 'hypothetical protein',
      },
    });
    const alreadyAnnotated = parameters({
      currentAnnotation: {
        product: 'Homoserine kinase',
        go_terms: ['GO:0004413', 'GO:0008152'],
      },
    });

    expect(generateCacheKey(placeholder)).toBe(generateCacheKey(equivalent));
    expect(generateCacheKey(placeholder)).not.toBe(generateCacheKey(alreadyAnnotated));
    expect(buildCacheKeyPayload(placeholder).parameters).toMatchObject({
      currentAnnotation: {
        product: 'hypothetical protein',
        note: ['existing evidence summary. pmid:38253429'],
        go_terms: ['0004413', '0008152'],
      },
    });
  });
});

describe('research cache quality boundary', () => {
  it('requires an exact target and more than one substantive evidence record', () => {
    const request = parameters();
    const result = substantiveResult();

    expect(isReusableResearchResult(request, result)).toBe(true);
    expect(isReusableResearchResult(parameters({ target: undefined }), result)).toBe(false);
    expect(isReusableResearchResult(request, {
      ...result,
      annotationProposal: {
        ...result.annotationProposal,
        target: { ...target, featureHash: 'different-hash' },
      },
    })).toBe(false);
    expect(isReusableResearchResult(request, {
      ...result,
      sources: [result.sources[0]],
    })).toBe(false);
  });

  it('does not treat unrelated structured PubMed records as reusable target authority', () => {
    const result = substantiveResult();
    const noisySources = result.sources.map(source => ({
      ...source,
      authoritative: false,
      targetMatch: false,
      structuredData: { targetRelevance: { accepted: false, reason: 'off-target homonym' } },
    }));

    expect(isReusableResearchResult(parameters(), {
      ...result,
      sources: noisySources,
    })).toBe(false);
  });

  it('does not store placeholder or snippet-only results', async () => {
    const request = parameters();
    await cacheService.setCachedResult(request, {
      ...substantiveResult(),
      finalReport: 'Molecular Function: [Brief description of primary function]',
    });
    expect((await cacheService.getCacheStats()).totalItems).toBe(0);

    await cacheService.setCachedResult(request, {
      ...substantiveResult(),
      sources: [{
        database: 'searxng',
        url: 'https://example.test/snippet',
        content: 'A search result snippet that mentions thrB but is not independently corroborated or authoritative.',
      }],
    });
    expect((await cacheService.getCacheStats()).totalItems).toBe(0);
  });

  it('clones reusable results across the cache boundary', async () => {
    const request = parameters();
    const result = substantiveResult();
    await cacheService.setCachedResult(request, result);

    result.sources[0].content = 'mutated by caller';
    const cached = await cacheService.getCachedResult(request);
    expect(cached.sources[0].content).toContain('Functional characterization');

    cached.sources[0].content = 'mutated cached view';
    expect((await cacheService.getCachedResult(request)).sources[0].content)
      .toContain('Functional characterization');
  });
});
