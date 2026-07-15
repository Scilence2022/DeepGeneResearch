import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchPubMed, searchUniProt } from './search-providers';

describe('gene search provider cancellation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('threads caller cancellation into an active provider fetch', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('missing fetch signal'));
        return;
      }
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);

    const research = searchPubMed({
      provider: 'pubmed',
      query: 'thrL function',
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
      signal: controller.signal,
    });
    controller.abort(new Error('curator cancelled research'));

    await expect(research).rejects.toThrow('curator cancelled research');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });
});

describe('gene search provider evidence retrieval', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses a bounded PubMed query and preserves PMID provenance', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        esearchresult: { idlist: ['8660667'] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(`
        <PubmedArticleSet><PubmedArticle><MedlineCitation>
          <PMID>8660667</PMID><Article><ArticleTitle>Functional group characterization of homoserine kinase</ArticleTitle>
          <Abstract><AbstractText>Biochemical characterization in Escherichia coli.</AbstractText></Abstract>
          <Journal><ISOAbbreviation>Biochemistry</ISOAbbreviation><JournalIssue><PubDate><Year>1996</Year></PubDate></JournalIssue></Journal>
          <AuthorList><Author><ForeName>A</ForeName><LastName>Researcher</LastName></Author></AuthorList>
          </Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1000/example</ArticleId></ArticleIdList></PubmedData>
        </PubmedArticle></PubmedArticleSet>
      `, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchPubMed({
      provider: 'pubmed',
      query: 'thrB biological process cellular function Escherichia coli',
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      maxResult: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const searchUrl = String(fetchMock.mock.calls[0][0]);
    expect(decodeURIComponent(searchUrl)).toContain('"thrB"[Title/Abstract]');
    expect(decodeURIComponent(searchUrl)).not.toContain('biological process cellular function');
    expect(result.sources[0]).toMatchObject({
      url: 'https://pubmed.ncbi.nlm.nih.gov/8660667/',
      database: 'pubmed',
    });
    expect(result.sources[0].content).toContain('PMID: 8660667');
    expect(result.sources[0].structuredData?.literatureReferences?.[0].pmid).toBe('8660667');
  });

  it('uses valid UniProt exact-gene and organism-name fields and returns structured annotation', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        primaryAccession: 'P00547',
        uniProtkbId: 'KHSE_ECOLI',
        entryType: 'UniProtKB reviewed (Swiss-Prot)',
        proteinDescription: { recommendedName: { fullName: { value: 'Homoserine kinase' }, ecNumbers: [{ value: '2.7.1.39' }] } },
        genes: [{ geneName: { value: 'thrB' }, orderedLocusNames: [{ value: 'b0003' }] }],
        organism: { scientificName: 'Escherichia coli (strain K12)' },
        comments: [
          { commentType: 'FUNCTION', texts: [{ value: 'Catalyzes ATP-dependent phosphorylation of L-homoserine.' }] },
          { commentType: 'CATALYTIC ACTIVITY', reaction: { name: 'L-homoserine + ATP = O-phospho-L-homoserine + ADP', ecNumber: '2.7.1.39', evidences: [{ source: 'PubMed', id: '8973190' }] } },
        ],
        sequence: { length: 310, molWeight: 33624 },
        uniProtKBCrossReferences: [{ database: 'GeneID', id: '947498' }, { database: 'GO', id: 'GO:0004412' }],
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchUniProt({
      provider: 'uniprot', query: 'ignored verbose prompt', geneSymbol: 'thrB', organism: 'Escherichia coli',
    });

    const url = decodeURIComponent(String(fetchMock.mock.calls[0][0]));
    expect(url).toContain('gene_exact:thrB AND organism_name:"Escherichia coli"');
    expect(url).not.toContain(' organism:');
    expect(result.sources[0].annotation).toMatchObject({
      product: 'Homoserine kinase',
      ecNumbers: ['2.7.1.39'],
      goTerms: ['GO:0004412'],
      reviewed: true,
    });
    expect(result.sources[0].content).toContain('PMID:8973190');
  });

  it('reports upstream HTTP failures instead of presenting them as a clean empty search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })));
    const result = await searchPubMed({ provider: 'pubmed', query: 'thrB', geneSymbol: 'thrB', organism: 'Escherichia coli' });
    expect(result.sources).toEqual([]);
    expect(result.metadata.error).toContain('HTTP 429');
  });
});
