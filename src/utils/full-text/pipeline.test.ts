import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FULL_TEXT_CANONICALIZATION,
  FULL_TEXT_OFFSET_ENCODING,
  type FullTextDocument,
} from '@/utils/gene-research/full-text';

const resolveEuropePmcWork = vi.fn();
const acquireEuropePmcJats = vi.fn();
const fetchEuropePmcAnnotations = vi.fn();
vi.mock('@/utils/full-text/providers/europe-pmc', () => ({
  resolveEuropePmcWork: (...args: unknown[]) => resolveEuropePmcWork(...args),
  acquireEuropePmcJats: (...args: unknown[]) => acquireEuropePmcJats(...args),
  fetchEuropePmcAnnotations: (...args: unknown[]) => fetchEuropePmcAnnotations(...args),
  europePmcSupplementaryFilesUrl: (pmcid: string) => `https://example.test/${pmcid}/supplementaryFiles`,
}));

const acquirePubtatorBioc = vi.fn();
vi.mock('@/utils/full-text/providers/pubtator', () => ({
  acquirePubtatorBioc: (...args: unknown[]) => acquirePubtatorBioc(...args),
}));

const fetchCrossrefWorkMetadata = vi.fn();
vi.mock('@/utils/full-text/providers/crossref', () => ({
  fetchCrossrefWorkMetadata: (...args: unknown[]) => fetchCrossrefWorkMetadata(...args),
}));

const locateUnpaywallOaCopy = vi.fn();
vi.mock('@/utils/full-text/providers/unpaywall', () => ({
  locateUnpaywallOaCopy: (...args: unknown[]) => locateUnpaywallOaCopy(...args),
}));

const acquireBioRxivPreprintPdf = vi.fn();
vi.mock('@/utils/full-text/providers/biorxiv', () => ({
  acquireBioRxivPreprintPdf: (...args: unknown[]) => acquireBioRxivPreprintPdf(...args),
}));

const acquireOpenAlexTei = vi.fn();
vi.mock('@/utils/full-text/providers/openalex', () => ({
  acquireOpenAlexTei: (...args: unknown[]) => acquireOpenAlexTei(...args),
}));

const discoverCoreFullText = vi.fn();
vi.mock('@/utils/full-text/providers/core', () => ({
  discoverCoreFullText: (...args: unknown[]) => discoverCoreFullText(...args),
}));

const acquireBiocPmcFullText = vi.fn();
vi.mock('@/utils/full-text/providers/bioc-pmc', () => ({
  acquireBiocPmcFullText: (...args: unknown[]) => acquireBiocPmcFullText(...args),
}));

const convertPublicationIds = vi.fn();
vi.mock('@/utils/full-text/providers/ncbi-idconv', () => ({
  convertPublicationIds: (...args: unknown[]) => convertPublicationIds(...args),
}));

const locatePmcOaPackage = vi.fn();
vi.mock('@/utils/full-text/providers/pmc-oa', () => ({
  locatePmcOaPackage: (...args: unknown[]) => locatePmcOaPackage(...args),
}));

const fetchSemanticScholarEnrichment = vi.fn();
vi.mock('@/utils/full-text/providers/semanticscholar', () => ({
  fetchSemanticScholarEnrichment: (...args: unknown[]) => fetchSemanticScholarEnrichment(...args),
}));

const fetchPublicBytes = vi.fn();
vi.mock('@/utils/safe-public-fetch', () => ({
  fetchPublicBytes: (...args: unknown[]) => fetchPublicBytes(...args),
}));

import { acquireFullTextEvidence, locateProviderAnnotations, resolveEnabledProviders } from './pipeline';

function documentOf(text: string, origin: FullTextDocument['origin'] = 'pmc_xml'): FullTextDocument {
  return {
    schema: 'dgr.full-text-document.v1',
    origin,
    name: 'doc',
    mediaType: 'application/xml',
    documentSha256: createHash('sha256').update('raw').digest('hex'),
    text,
    textSha256: createHash('sha256').update(text).digest('hex'),
    textLength: text.length,
    canonicalization: FULL_TEXT_CANONICALIZATION,
    offsetEncoding: FULL_TEXT_OFFSET_ENCODING,
    pageCount: null,
    parsedPageCount: null,
    parseCoverage: 1,
    pages: [],
    identifiers: { pmid: '12345678' },
    retrievedAt: '2026-08-18T00:00:00.000Z',
    parser: 'test',
  };
}

const ENV = {
  ncbiApiKey: undefined,
  crossrefMailto: 'dev@example.test',
  unpaywallEmail: 'dev@example.test',
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchEuropePmcAnnotations.mockResolvedValue([]);
  fetchCrossrefWorkMetadata.mockResolvedValue(null);
  locateUnpaywallOaCopy.mockResolvedValue(null);
  fetchPublicBytes.mockRejectedValue(new Error('offline test host'));
});

describe('acquireFullTextEvidence waterfall', () => {
  it('resolves identifiers, prefers Europe PMC JATS, and short-circuits later providers', async () => {
    resolveEuropePmcWork.mockResolvedValue({ pmid: '12345678', pmcid: 'PMC123', doi: '10.1/x', title: 'T' });
    acquireEuropePmcJats.mockResolvedValue(documentOf('JATS full text'));

    const result = await acquireFullTextEvidence({ pmid: '12345678' }, {}, ENV);

    expect(result.content?.provider).toBe('europe_pmc');
    expect(result.content?.format).toBe('jats');
    expect(result.content?.supplementaryFilesUrl).toContain('PMC123');
    expect(acquirePubtatorBioc).not.toHaveBeenCalled();
    expect(result.attempts.map(a => `${a.provider}:${a.status}`)).toContain('europe_pmc:success');
  });

  it('falls back to PubTator BioC when no PMC full text exists', async () => {
    resolveEuropePmcWork.mockResolvedValue({ pmid: '12345678', doi: '10.1/x' });
    acquirePubtatorBioc.mockResolvedValue({
      provider: 'pubtator',
      format: 'bioc',
      document: documentOf('BioC full text', 'bioc'),
      providerAnnotations: [{ type: 'Gene', mention: 'lysC', start: -1, end: -1 }],
    });

    const result = await acquireFullTextEvidence({ pmid: '12345678' }, { allowPdf: false }, ENV);

    expect(result.content?.provider).toBe('pubtator');
    expect(result.content?.providerAnnotations?.[0].mention).toBe('lysC');
  });

  it('merges Crossref metadata including the retraction signal', async () => {
    resolveEuropePmcWork.mockResolvedValue({ pmid: '12345678', pmcid: 'PMC123', doi: '10.1/x' });
    acquireEuropePmcJats.mockResolvedValue(documentOf('JATS full text'));
    fetchCrossrefWorkMetadata.mockResolvedValue({ license: 'https://creativecommons.org/licenses/by/4.0/', isRetracted: true });

    const result = await acquireFullTextEvidence({ pmid: '12345678', doi: '10.1/x' }, {}, ENV);

    expect(result.metadata.isRetracted).toBe(true);
    expect(result.metadata.license).toContain('creativecommons');
    expect(result.attempts.find(a => a.provider === 'crossref')?.warnings?.[0]).toMatch(/retracted/i);
  });

  it('records errors without aborting the rest of the waterfall', async () => {
    resolveEuropePmcWork.mockRejectedValue(new Error('EPMC down'));
    acquirePubtatorBioc.mockResolvedValue({
      provider: 'pubtator',
      format: 'bioc',
      document: documentOf('BioC full text', 'bioc'),
    });

    const result = await acquireFullTextEvidence({ pmid: '12345678' }, { allowPdf: false }, ENV);

    expect(result.content?.provider).toBe('pubtator');
    expect(result.attempts.find(a => a.provider === 'europe_pmc')?.status).toBe('error');
  });

  it('attaches Europe PMC annotations to the acquired document', async () => {
    resolveEuropePmcWork.mockResolvedValue({ pmid: '12345678', pmcid: 'PMC123' });
    acquireEuropePmcJats.mockResolvedValue(documentOf('JATS full text mentioning lysC'));
    fetchEuropePmcAnnotations.mockResolvedValue([{ type: 'Gene_Proteins', mention: 'lysC', start: -1, end: -1 }]);

    const result = await acquireFullTextEvidence({ pmid: '12345678' }, { allowPdf: false }, ENV);

    expect(fetchEuropePmcAnnotations).toHaveBeenCalledWith(['PMC:123', 'MED:12345678']);
    expect(result.content?.providerAnnotations?.[0].type).toBe('Gene_Proteins');
  });

  it('routes preprint DOIs through the bioRxiv PDF step', async () => {
    resolveEuropePmcWork.mockResolvedValue({ doi: '10.1101/2024.01.01.1', isPreprint: true });
    acquirePubtatorBioc.mockResolvedValue(null);
    acquireBioRxivPreprintPdf.mockResolvedValue({
      provider: 'biorxiv',
      format: 'pdf',
      document: documentOf('preprint pdf text', 'pdf'),
    });

    const result = await acquireFullTextEvidence(
      { doi: '10.1101/2024.01.01.1' },
      {},
      ENV,
    );

    expect(acquireBioRxivPreprintPdf).toHaveBeenCalledWith('10.1101/2024.01.01.1');
    expect(result.content?.provider).toBe('biorxiv');
  });

  it('uses OpenAlex GROBID TEI as the structured fallback when keyed', async () => {
    resolveEuropePmcWork.mockResolvedValue({ pmid: '12345678', doi: '10.1/x' });
    acquirePubtatorBioc.mockResolvedValue(null);
    acquireOpenAlexTei.mockResolvedValue({
      provider: 'openalex',
      format: 'tei',
      document: documentOf('TEI full text', 'tei'),
    });

    const result = await acquireFullTextEvidence(
      { pmid: '12345678', doi: '10.1/x' },
      {},
      { ...ENV, openAlexApiKey: 'key-1' },
    );

    expect(acquireOpenAlexTei).toHaveBeenCalledWith('10.1/x', { apiKey: 'key-1' });
    expect(result.content?.provider).toBe('openalex');
  });

  it('discovers a CORE green-OA copy before the Unpaywall PDF step', async () => {
    resolveEuropePmcWork.mockResolvedValue({ pmid: '12345678', doi: '10.1/x' });
    acquirePubtatorBioc.mockResolvedValue(null);
    discoverCoreFullText.mockResolvedValue({ oaPdfUrl: 'https://repo.example.test/paper.pdf' });

    const result = await acquireFullTextEvidence(
      { pmid: '12345678', doi: '10.1/x' },
      { enabledProviders: ['europe_pmc', 'pubtator', 'core'] },
      { ...ENV, coreApiKey: 'key-2' },
    );

    expect(discoverCoreFullText).toHaveBeenCalledWith('10.1/x', { apiKey: 'key-2' });
    // The PDF download is attempted via fetchPublicBytes (mocked offline
    // here); the failure is recorded as an attempt, not thrown.
    expect(fetchPublicBytes).toHaveBeenCalledWith('https://repo.example.test/paper.pdf', expect.anything());
    expect(result.attempts.find(a => a.provider === 'core')?.status).toBe('error');
  });
});

describe('resolveEnabledProviders', () => {
  it('enables Tier 1 by default and gates Unpaywall on its email', () => {
    expect(resolveEnabledProviders({ crossrefMailto: 'a@b.c' }, undefined, undefined)).toEqual(
      expect.arrayContaining(['europe_pmc', 'pubtator', 'crossref']),
    );
    expect(resolveEnabledProviders({ crossrefMailto: 'a@b.c' }, undefined, undefined)).not.toContain('unpaywall');
    expect(resolveEnabledProviders({ unpaywallEmail: 'a@b.c' }, undefined, undefined)).toContain('unpaywall');
  });

  it('gates Tier 2 providers on credentials and honors the whitelist override', () => {
    const env = { astaApiKey: 'k', openAlexApiKey: 'k', coreApiKey: 'k' };
    const enabled = resolveEnabledProviders(env, undefined, undefined);
    expect(enabled).toEqual(expect.arrayContaining(['asta', 'openalex', 'core']));
    expect(enabled).not.toContain('semantic_scholar');

    const whitelist = resolveEnabledProviders(env, undefined, 'pubtator, arxiv');
    expect(whitelist).toEqual(['pubtator', 'arxiv']);
  });
});

describe('locateProviderAnnotations', () => {
  it('maps mention annotations to document offsets and drops misses', () => {
    const document = documentOf('The lysC gene encodes aspartokinase III.');
    const located = locateProviderAnnotations(document, [
      { type: 'Gene', mention: 'lysC', start: -1, end: -1 },
      { type: 'Gene', mention: 'absentMention', start: -1, end: -1 },
      { type: 'Gene', mention: 'pre-located', start: 4, end: 8 },
    ]);
    expect(located).toHaveLength(2);
    expect(document.text.slice(located[0].start, located[0].end)).toBe('lysC');
    expect(located[1].mention).toBe('pre-located');
  });
});
