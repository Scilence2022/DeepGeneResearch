import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { GeneResearchEngine } from './index';
import { buildAnnotationCurationSummary } from './codexomics-annotation';
import { searchAstaSnippets } from '@/utils/full-text/providers/asta';

vi.mock('@/utils/full-text/pipeline', () => ({
  acquireFullTextEvidence: async () => ({ content: null, metadata: {}, attempts: [] }),
  locateProviderAnnotations: () => [],
  readFullTextEnv: () => ({ astaApiKey: 'offline' }),
  resolveEnabledProviders: () => ['asta'],
}));
vi.mock('@/utils/full-text/providers/asta', () => ({ searchAstaSnippets: vi.fn() }));

const target = {
  workspaceId: 'ws', genomeId: 'g', annotationRevision: 0, featureId: 'f', featureHash: 'h',
  chromosome: 'chr', featureType: 'CDS', locusTag: 'b4024', geneSymbol: 'lysC', organism: 'Escherichia coli',
};
const text = [
  'Experiments in Escherichia coli showed that deletion of lysC reduced growth during lysine limitation.',
  'Biochemical assays showed that lysine inhibits LysC activity in vivo.',
  'Purified lysC enzyme showed catalytic activity when incubated with aspartate.',
].join(' ');
const textSha256 = createHash('sha256').update(text).digest('hex');

function pubmed(pmid: string) {
  return {
    pmid,
    doi: '10.5555/study-a',
    title: 'Escherichia coli lysC gene study',
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    database: 'pubmed',
    provenance: { recordId: pmid, provider: 'pubmed' },
    content: text,
    structuredData: {
      literatureReferences: [{ pmid, abstract: text }],
      targetRelevance: { accepted: true, directness: 'direct' },
    },
  };
}

describe('publication identity in open-text retrieval', () => {
  it.each([
    ['another work', { pmid: '20000002', doi: '10.5555/study-b' }, false],
    ['a matching DOI with a conflicting PMID', { pmid: '20000002', doi: '10.5555/study-a' }, false],
    ['missing identifiers', {}, false],
    ['the same work', { pmid: '10000001', doi: 'https://doi.org/10.5555/STUDY-A' }, true],
  ] as const)('does not promote Asta passages from %s to full-text evidence', async (_name, identifiers, match) => {
    const search = vi.mocked(searchAstaSnippets);
    search.mockReset();
    search.mockResolvedValue([{
      provider: 'asta',
      format: 'snippet',
      document: {
        schema: 'dgr.full-text-document.v1', origin: 'snippet', name: 'Escherichia coli lysC gene study',
        mediaType: 'text/plain', documentSha256: textSha256, text, textSha256,
        textLength: text.length, canonicalization: 'dgr.full-text.v1', offsetEncoding: 'utf16_code_units',
        pages: [], identifiers, pageCount: null, parsedPageCount: null, parseCoverage: 1,
        retrievedAt: '2026-11-05T00:00:00.000Z', parser: 'offline-fixture',
      },
    }]);
    const engine = new GeneResearchEngine({ geneSymbol: target.geneSymbol, organism: target.organism, target });
    const sources = [pubmed('10000001'), pubmed('10000003')];
    await Reflect.get(engine, 'retrieveOpenFullText').call(engine, new Map([['fixture', { sources }]]));
    expect(search).toHaveBeenCalledOnce();
    expect(sources[0]).not.toHaveProperty('fullText');
    expect(sources[0]).not.toHaveProperty('fullTextEvidence');
    expect(sources[0].content).toBe(text);
    if (match) {
      expect(sources[0]).toHaveProperty('structuredData.discoverySnippet.identifiers', identifiers);
      expect(sources[1]).not.toHaveProperty('structuredData.discoverySnippet');
    } else {
      expect(sources[0]).not.toHaveProperty('structuredData.discoverySnippet');
    }
    const bundle = buildAnnotationCurationSummary({ ...target, target, sources });
    expect(bundle.researchSummary.facts.every(fact => fact.literatureBasis?.kind !== 'full_text_span')).toBe(true);
  });
});
