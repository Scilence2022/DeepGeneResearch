import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  searchQuickGo,
  searchInterPro,
  searchIntAct,
  searchEuropePmcPreprints,
} from './curation-providers';

describe('curation data sources', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('resolves GO annotations through the Gene Ontology API', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      associations: [
        { object: { id: 'GO:0004072', label: 'aspartate kinase activity' }, relation: { id: 'enables', label: 'enables' } },
        { object: { id: 'GO:0009088', label: 'threonine biosynthetic process' }, relation: { id: 'involved_in', label: 'involved in' } },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchQuickGo({ geneSymbol: 'lysC', taxonId: 83333 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][0]))).toContain('NCBITaxon:83333/lysC/function');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].annotation?.goTerms).toEqual(['GO:0004072', 'GO:0009088']);
    expect(result.sources[0].database).toBe('quickgo');
  });

  it('degrades cleanly when the taxon id is missing', async () => {
    const result = await searchQuickGo({ geneSymbol: 'lysC' });
    expect(result.sources).toEqual([]);
    expect(result.metadata.disabled).toBe(true);
  });

  it('resolves InterPro domain architecture for an exact accession', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      protein: {
        accession: 'P08660',
        matches: [
          { accession: 'IPR001048', source_database: 'pfam' },
          { accession: 'IPR036393', source_database: 'gene3d' },
        ],
      },
    }), { status: 200 })));

    const result = await searchInterPro({ proteinId: 'P08660', geneSymbol: 'lysC' });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].annotation?.dbXrefs).toEqual(['IPR001048', 'IPR036393']);
    expect(result.sources[0].database).toBe('interpro');
  });

  it('returns disabled metadata when no protein accession is available', async () => {
    const result = await searchInterPro({ proteinId: '', geneSymbol: 'lysC' });
    expect(result.sources).toEqual([]);
    expect(result.metadata.disabled).toBe(true);
  });

  it('resolves IntAct interactions with a taxid filter', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      binaryInteractionMap: [
        { interactorA: { preferredName: 'lysC' }, interactorB: { preferredName: 'thrA' }, interaction: { interactionTypeName: 'physical association' } },
        { interactorA: { preferredName: 'lysC' }, interactorB: { preferredName: 'dapA' }, interaction: { interactionTypeName: 'physical association' } },
      ],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchIntAct({ geneSymbol: 'lysC', taxonId: 83333 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body || ''));
    expect(body.taxid).toBe('83333');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].structuredData?.partners).toEqual(['lysC', 'thrA', 'dapA']);
  });

  it('finds preprint abstracts through the Europe PMC preprint corpus', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      resultList: {
        result: [
          {
            id: 'PPR100000',
            title: 'Functional characterization of lysC in Escherichia coli',
            abstractText: 'The lysC gene encodes lysine-sensitive aspartokinase III in Escherichia coli.',
            doi: '10.1101/2024.01.01.123456',
            source: 'PPR',
            authorString: 'Doe J, Smith K.',
          },
        ],
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchEuropePmcPreprints({
      query: 'lysC preprint evidence Escherichia coli',
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      maxResult: 10,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('query')).toContain('SRC:PPR');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].database).toBe('europepmc_preprints');
    expect(result.sources[0].url).toContain('doi.org');
  });
});
