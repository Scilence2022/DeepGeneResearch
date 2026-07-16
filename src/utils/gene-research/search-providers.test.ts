import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assessGeneTargetRelevance,
  createGeneSearchProvider,
  fetchGeneIdsForProteinAccession,
  fetchPubMedIdsForGene,
  searchKEGG,
  searchPubMed,
  searchUniProt,
} from './search-providers';

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
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort(new Error('curator cancelled research'));

    await expect(research).rejects.toThrow('curator cancelled research');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });
});

describe('gene search provider evidence retrieval', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('retains the exact Gene-PubMed XML link set despite malformed control-character text', async () => {
    const linkedPmids = Array.from({ length: 38 }, (_, index) => String(9000000 + index));
    const fetchMock = vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      expect(url.searchParams.get('retmode')).toBe('xml');
      return new Response(`
        <eLinkResult><LinkSet><IdList><Id>948531</Id></IdList>
          <LinkSetDb><DbTo>pubmed</DbTo><LinkName>gene_pubmed</LinkName>
            ${linkedPmids.map(pmid => `<Link><Id>${pmid}</Id></Link>`).join('')}
            <Link><Id>${linkedPmids[0]}</Id></Link>
          </LinkSetDb>
          <LinkSetDb><DbTo>protein</DbTo><Link><Id>16131850</Id></Link></LinkSetDb>
          <ERROR>upstream text with a literal control character: \u0001</ERROR>
        </LinkSet></eLinkResult>
      `, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPubMedIdsForGene('948531')).resolves.toEqual(linkedPmids);
  });

  it('falls back to the exact Gene record when ELink returns an empty truncated response', async () => {
    const fetchMock = vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      if (url.pathname.endsWith('/elink.fcgi')) {
        return new Response('<?xml version="1.0" encoding="UTF-8" ?>', { status: 200 });
      }
      if (url.pathname.endsWith('/efetch.fcgi') && url.searchParams.get('db') === 'gene') {
        return new Response('<Entrezgene><Gene-commentary_refs><PubMedId>9278503</PubMedId><PubMedId>16397293</PubMedId><PubMedId>9278503</PubMedId></Gene-commentary_refs></Entrezgene>', { status: 200 });
      }
      throw new Error(`Unexpected NCBI request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPubMedIdsForGene('948531')).resolves.toEqual(['9278503', '16397293']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('resolves a protein-only CDS through exact Protein-Gene links before Gene-PubMed seeding', async () => {
    const fetchMock = vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      if (url.pathname.endsWith('/esearch.fcgi') && url.searchParams.get('db') === 'protein') {
        return new Response(JSON.stringify({ esearchresult: { idlist: ['16131850'] } }), { status: 200 });
      }
      if (url.pathname.endsWith('/elink.fcgi') && url.searchParams.get('dbfrom') === 'protein') {
        return new Response(JSON.stringify({
          linksets: [{
            dbfrom: 'protein',
            ids: ['16131850'],
            linksetdbs: [{ dbto: 'gene', linkname: 'protein_gene', links: ['948531'] }],
          }],
        }), { status: 200 });
      }
      if (url.pathname.endsWith('/efetch.fcgi') && url.searchParams.get('db') === 'gene') {
        return new Response(`
          <Entrezgene>
            <Gene-track_geneid>948531</Gene-track_geneid>
            <Gene-ref_locus>lysC</Gene-ref_locus>
            <Gene-ref_locus-tag>b4024</Gene-ref_locus-tag>
            <Gene-ref_desc>Lysine-sensitive aspartokinase 3</Gene-ref_desc>
            <Org-ref_taxname>Escherichia coli</Org-ref_taxname>
            <Entrezgene_summary>Catalyzes the first committed step of lysine biosynthesis.</Entrezgene_summary>
          </Entrezgene>
        `, { status: 200 });
      }
      if (url.pathname.endsWith('/elink.fcgi') && url.searchParams.get('dbfrom') === 'gene') {
        return new Response(`
          <eLinkResult><LinkSet><IdList><Id>948531</Id></IdList><LinkSetDb>
            <DbTo>pubmed</DbTo><LinkName>gene_pubmed</LinkName>
            <Link><Id>6312411</Id></Link><Link><Id>14623187</Id></Link>
          </LinkSetDb></LinkSet></eLinkResult>
        `, { status: 200 });
      }
      throw new Error(`Unexpected NCBI request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchGeneIdsForProteinAccession('NP_418448.1')).resolves.toEqual(['948531']);
    fetchMock.mockClear();

    const result = await createGeneSearchProvider({
      provider: 'ncbi_gene',
      query: 'provisional_name exact gene identity Escherichia coli',
      geneSymbol: 'provisional_name',
      organism: 'Escherichia coli',
      proteinId: 'NP_418448.1',
      maxResult: 10,
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      sourceId: 'GeneID:948531',
      targetMatch: true,
      provenance: {
        recordId: '948531',
        matchedBy: expect.arrayContaining(['protein_gene_link', 'organism_name']),
        proteinIds: ['NP_418448.1'],
      },
      structuredData: { geneBasicInfo: { geneID: '948531', geneSymbol: 'lysC' } },
    });
    expect(result.sources[0].provenance?.matchedBy).not.toContain('gene_symbol');
    expect(fetchMock.mock.calls.some(([rawUrl]) => {
      const url = new URL(String(rawUrl));
      return url.pathname.endsWith('/esearch.fcgi') && url.searchParams.get('db') === 'gene';
    })).toBe(false);

    const geneId = result.sources[0].structuredData?.geneBasicInfo?.geneID;
    await expect(fetchPubMedIdsForGene(geneId)).resolves.toEqual(['6312411', '14623187']);
  });

  it('uses a bounded PubMed query and preserves PMID provenance', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        esearchresult: { idlist: ['8660667'] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        esearchresult: { idlist: ['8660667'] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(`
        <PubmedArticleSet><PubmedArticle><MedlineCitation>
          <PMID>8660667</PMID><Article><ArticleTitle>Functional characterization of thrB homoserine kinase</ArticleTitle>
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
      identityTerms: ['Homoserine kinase'],
      maxResult: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
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

  it('uses the journal publication year and decodes valid numeric XML entities', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`
      <PubmedArticleSet><PubmedArticle><MedlineCitation>
        <PMID>33976604</PMID>
        <DateRevised><Year>2024</Year><Month>01</Month><Day>01</Day></DateRevised>
        <Article>
          <ArticleTitle>Escherichia coli lysC regulation at C&#xf4;t&#233; &#x110000;</ArticleTitle>
          <Abstract><AbstractText>The Escherichia coli lysC gene encodes lysine-sensitive aspartokinase III.</AbstractText></Abstract>
          <Journal><JournalIssue><PubDate><Year>2021</Year></PubDate></JournalIssue><Title>Metabolic Engineering</Title></Journal>
          <AuthorList><Author><ForeName>Ren&#233;</ForeName><LastName>C&#xF4;t&#xE9;</LastName></Author></AuthorList>
          <ArticleDate DateType="Electronic"><Year>2020</Year></ArticleDate>
        </Article>
      </MedlineCitation><PubmedData>
        <History><PubMedPubDate PubStatus="pubmed"><Year>2025</Year></PubMedPubDate></History>
        <ArticleIdList><ArticleId IdType="doi">10.1000/primary</ArticleId></ArticleIdList>
        <ReferenceList><Reference><ArticleIdList><ArticleId IdType="doi">10.1000/reference</ArticleId></ArticleIdList></Reference></ReferenceList>
      </PubmedData></PubmedArticle></PubmedArticleSet>
    `, { status: 200 })));

    const result = await searchPubMed({
      provider: 'pubmed',
      query: 'lysC Escherichia coli',
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      seedPmids: ['33976604'],
      scope: 'seed_only',
    });

    const reference = result.sources[0].structuredData?.literatureReferences?.[0];
    expect(reference).toMatchObject({
      year: 2021,
      doi: '10.1000/primary',
      authors: ['René Côté'],
    });
    expect(reference?.title).toContain('Côté');
    expect(reference?.title).toContain('&#x110000;');
    expect(result.sources[0].content).not.toContain('10.1000/reference');
  });

  it('falls back to MedlineDate and never borrows a DOI from a cited reference', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`
      <PubmedArticleSet><PubmedArticle><MedlineCitation>
        <PMID>13916055</PMID>
        <DateCompleted><Year>1998</Year></DateCompleted>
        <Article>
          <ArticleTitle>Early characterization of the Escherichia coli lysC locus</ArticleTitle>
          <Abstract><AbstractText>The Escherichia coli lysC locus encodes an aspartokinase.</AbstractText></Abstract>
          <Journal><JournalIssue><PubDate><MedlineDate>1961 Nov-Dec</MedlineDate></PubDate></JournalIssue></Journal>
          <ELocationID EIdType="doi" ValidYN="Y">10.1000/legacy-primary</ELocationID>
          <ArticleDate><Year>1999</Year></ArticleDate>
        </Article>
      </MedlineCitation><PubmedData>
        <ReferenceList><Reference><ArticleIdList><ArticleId IdType="doi">10.1000/wrong-reference</ArticleId></ArticleIdList></Reference></ReferenceList>
      </PubmedData></PubmedArticle></PubmedArticleSet>
    `, { status: 200 })));

    const result = await searchPubMed({
      provider: 'pubmed',
      query: 'lysC Escherichia coli',
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      seedPmids: ['13916055'],
      scope: 'seed_only',
    });

    expect(result.sources[0].structuredData?.literatureReferences?.[0]).toMatchObject({
      year: 1961,
      doi: '10.1000/legacy-primary',
    });
    expect(result.sources[0].content).not.toContain('10.1000/wrong-reference');
  });

  it('rejects lexical collisions such as lysozyme C and Lys-C while retaining exact lysC literature', async () => {
    const searchResponse = new Response(JSON.stringify({
      esearchresult: { idlist: ['1', '2', '3'] },
    }), { status: 200 });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(searchResponse)
      .mockResolvedValueOnce(new Response(JSON.stringify({ esearchresult: { idlist: ['1', '2', '3'] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ esearchresult: { idlist: ['1', '2', '3'] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(`
        <PubmedArticleSet>
          <PubmedArticle><MedlineCitation><PMID>1</PMID><Article>
            <ArticleTitle>Direct control of the Escherichia coli lysC riboswitch</ArticleTitle>
            <Abstract><AbstractText>The lysC regulatory RNA controls lysine biosynthesis in E. coli.</AbstractText></Abstract>
          </Article></MedlineCitation></PubmedArticle>
          <PubmedArticle><MedlineCitation><PMID>2</PMID><Article>
            <ArticleTitle>Lysozyme C activity in Escherichia coli cultures</ArticleTitle>
            <Abstract><AbstractText>We characterize a heterologous lysozyme C reagent.</AbstractText></Abstract>
          </Article></MedlineCitation></PubmedArticle>
          <PubmedArticle><MedlineCitation><PMID>3</PMID><Article>
            <ArticleTitle>Deep screening of the C-terminome</ArticleTitle>
            <Abstract><AbstractText>E. coli cell lysates underwent parallel digestion with trypsin and LysC protease.</AbstractText></Abstract>
          </Article></MedlineCitation></PubmedArticle>
        </PubmedArticleSet>
      `, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchPubMed({
      provider: 'pubmed',
      query: 'lysC regulation biosynthesis Escherichia coli',
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      locusTag: 'b4024',
      proteinId: 'P08660',
      identityTerms: ['Lysine-sensitive aspartokinase 3'],
      maxResult: 10,
    });

    expect(result.sources).toHaveLength(1);
    expect(result.sources[0].title).toContain('lysC riboswitch');
    expect(result.sources[0].structuredData?.targetRelevance).toMatchObject({
      accepted: true,
      matchedBy: expect.arrayContaining(['gene_symbol', 'organism_text']),
    });
  });

  it.each([
    {
      pmid: '25063446',
      title: "Multi-enzyme digestion FASP and the 'Total Protein Approach'-based absolute quantification of the Escherichia coli proteome.",
      abstract: 'Consecutive digestion of whole cell lysates with LysC and trypsin allowed generation of two peptide populations in Escherichia coli.',
      reason: /protease|digestion reagent/,
    },
    {
      pmid: '19932188',
      title: 'Characterization of expression, activity and role in antibacterial immunity of Anopheles gambiae lysozyme c-1.',
      abstract: 'Transcripts of the LYSC-1 gene increased in mosquito cells, and knockdown affected infections with Escherichia coli.',
      reason: /lysozyme C/,
    },
    {
      pmid: '27038077',
      title: 'Identification of the Burkholderia pseudomallei bacteriophage ST79 lysis gene cassette.',
      abstract: 'The phage cassette contains lysB and lysC genes cloned into Escherichia coli for lysis assays.',
      reason: /bacteriophage|different source organism/,
    },
    {
      pmid: '9080702',
      title: 'Site-directed mutagenesis of the aspartokinase gene lysC in Brevibacterium flavum.',
      abstract: 'Escherichia coli transformants contained a mutagenized B. flavum lysC beta gene.',
      reason: /different source organism/,
    },
  ])('rejects real-world off-target PMID $pmid', ({ title, abstract, reason }) => {
    const relevance = assessGeneTargetRelevance(title, abstract, {
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      locusTag: 'b4024',
      proteinId: 'P08660',
      identityTerms: ['Lysine-sensitive aspartokinase 3', 'aspartokinase III'],
    });

    expect(relevance.accepted).toBe(false);
    expect(relevance.reason).toMatch(reason);
  });

  it('does not let a Gene-PubMed seed override an explicit lysC collision', () => {
    const reagent = assessGeneTargetRelevance(
      'Multi-enzyme digestion of the Escherichia coli proteome',
      'Whole-cell lysates were digested with LysC protease and trypsin before mass spectrometry.',
      { geneSymbol: 'lysC', organism: 'Escherichia coli', locusTag: 'b4024' },
      true,
    );
    const lysozyme = assessGeneTargetRelevance(
      'Lysozyme C expression after Escherichia coli challenge',
      'The LYSC-1 gene encodes lysozyme C in mosquito cells.',
      { geneSymbol: 'lysC', organism: 'Escherichia coli', locusTag: 'b4024' },
      true,
    );

    expect(reagent).toMatchObject({ accepted: false, directness: 'rejected' });
    expect(lysozyme).toMatchObject({ accepted: false, directness: 'rejected' });
  });

  it.each([
    ['Lys-C', 'Escherichia coli samples were processed by Lys-C protease digestion before mass spectrometry.'],
    ['Lys C', 'Escherichia coli samples underwent Lys C digestion before proteome quantification.'],
    ['lysyl endopeptidase', 'Escherichia coli proteins were cleaved with lysyl endopeptidase during sample processing.'],
    ['lysozyme-C', 'Expression of heterologous lysozyme-C was measured after Escherichia coli challenge.'],
  ])('rejects Gene-linked %s reagent or homonym spelling without an exact stable identifier', (_label, abstract) => {
    const relevance = assessGeneTargetRelevance(
      'Proteomic workflow in Escherichia coli',
      abstract,
      { geneSymbol: 'lysC', organism: 'Escherichia coli' },
      true,
    );

    expect(relevance).toMatchObject({ accepted: false, directness: 'rejected' });
  });

  it('allows an explicit stable target identifier to disambiguate Lys-C prose', () => {
    const relevance = assessGeneTargetRelevance(
      'NP_418448.1 characterization in Escherichia coli',
      'Samples were also digested with Lys-C protease during mass spectrometry.',
      { geneSymbol: 'lysC', organism: 'Escherichia coli', proteinId: 'NP_418448.1' },
      true,
    );

    expect(relevance).toMatchObject({
      accepted: true,
      directness: 'direct',
      matchedBy: expect.arrayContaining(['protein_id']),
    });
  });

  it('matches foreign taxa as words rather than substrings inside organization', () => {
    const relevance = assessGeneTargetRelevance(
      'Integrating microarray data with structure and organization of biosynthetic genes',
      'The Escherichia coli lysC gene was included in the pathway analysis.',
      { geneSymbol: 'lysC', organism: 'Escherichia coli', locusTag: 'b4024' },
      true,
    );

    expect(relevance.accepted).toBe(true);
  });

  it('requires the ambiguous symbol and organism to have sentence-level target context', () => {
    const unrelated = assessGeneTargetRelevance(
      'A broad Escherichia coli proteome survey',
      'The workflow measured gene expression. Samples were digested separately. LysC was used in a later proteomics step.',
      { geneSymbol: 'lysC', organism: 'Escherichia coli' },
    );
    const direct = assessGeneTargetRelevance(
      'Regulation of Escherichia coli lysC',
      'The Escherichia coli lysC gene is controlled by a lysine-responsive riboswitch.',
      { geneSymbol: 'lysC', organism: 'Escherichia coli' },
    );

    expect(unrelated.accepted).toBe(false);
    expect(direct).toMatchObject({ accepted: true, directness: 'direct' });
  });

  it('rejects papers focused on a different gene or organism even when they compare against lysC', () => {
    const otherGene = assessGeneTargetRelevance(
      'Nucleotide sequence of the metH gene of Escherichia coli K-12',
      'The Escherichia coli lysC gene lies in the compared chromosomal region.',
      { geneSymbol: 'lysC', organism: 'Escherichia coli', identityTerms: ['aspartokinase III'] },
    );
    const plantHomolog = assessGeneTargetRelevance(
      'Cloning of an Arabidopsis aspartate kinase cDNA',
      'The plant enzyme is homologous to lysine-sensitive aspartokinase III of Escherichia coli.',
      { geneSymbol: 'lysC', organism: 'Escherichia coli', identityTerms: ['lysine-sensitive aspartokinase III'] },
    );
    const linkedContext = assessGeneTargetRelevance(
      'Nucleotide sequence of the metH gene of Escherichia coli K-12',
      'The Escherichia coli lysC gene lies in the compared chromosomal region.',
      { geneSymbol: 'lysC', organism: 'Escherichia coli', identityTerms: ['aspartokinase III'] },
      true,
    );

    expect(otherGene.accepted).toBe(false);
    expect(plantHomolog.accepted).toBe(false);
    expect(linkedContext).toMatchObject({ accepted: true, directness: 'gene_linked_context' });
  });

  it('retries throttled NCBI discovery and still retrieves exact Gene-linked seed PMIDs', async () => {
    let throttled = false;
    const fetchMock = vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      expect(url.searchParams.get('api_key')).toBe('ncbi-test-key');
      if (url.pathname.endsWith('/esearch.fcgi')) {
        if (!throttled) {
          throttled = true;
          return new Response('rate limited', { status: 429, headers: { 'Retry-After': '0' } });
        }
        return new Response(JSON.stringify({ esearchresult: { idlist: [] } }), { status: 200 });
      }
      return new Response(`
        <PubmedArticleSet><PubmedArticle><MedlineCitation>
          <PMID>6312411</PMID><Article><ArticleTitle>Nucleotide sequence of the promoter region of the E. coli lysC gene.</ArticleTitle>
          <Abstract><AbstractText>The Escherichia coli lysC gene encodes lysine-sensitive aspartokinase III.</AbstractText></Abstract>
          <Journal><JournalIssue><PubDate><MedlineDate>1984 Jan-Feb</MedlineDate></PubDate></JournalIssue></Journal>
        </Article></MedlineCitation></PubmedArticle></PubmedArticleSet>
      `, { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchPubMed({
      provider: 'pubmed',
      query: 'lysC regulation Escherichia coli',
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      locusTag: 'b4024',
      identityTerms: ['Lysine-sensitive aspartokinase 3'],
      seedPmids: ['6312411'],
      apiKey: 'ncbi-test-key',
      maxResult: 5,
    });

    expect(result.sources.map(source => source.provenance?.recordId)).toContain('6312411');
    expect(result.sources[0].structuredData?.literatureReferences?.[0].year).toBe(1984);
    expect(result.metadata).toMatchObject({
      seedPmidsRequested: 1,
      seedPmidsRetrieved: 1,
      seedRetrievalComplete: true,
    });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('esearch.fcgi')).length).toBeGreaterThan(1);
  });

  it('chunks large exact Gene-linked PMID sets for bounded efetch requests', async () => {
    const seedPmids = Array.from({ length: 51 }, (_, index) => String(7000000 + index));
    const efetchChunkSizes: number[] = [];
    let esearchCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      if (url.pathname.endsWith('/esearch.fcgi')) {
        esearchCalls += 1;
        return new Response(JSON.stringify({ esearchresult: { idlist: [] } }), { status: 200 });
      }
      const ids = String(url.searchParams.get('id') || '').split(',').filter(Boolean);
      efetchChunkSizes.push(ids.length);
      const records = ids.map(pmid => `
        <PubmedArticle><MedlineCitation><PMID>${pmid}</PMID><Article>
          <ArticleTitle>NCBI Gene-linked lysC study ${pmid}</ArticleTitle>
          <Abstract><AbstractText>Exact NCBI Gene-linked context for Escherichia coli.</AbstractText></Abstract>
        </Article></MedlineCitation></PubmedArticle>
      `).join('');
      return new Response(`<PubmedArticleSet>${records}</PubmedArticleSet>`, { status: 200 });
    }));

    const result = await searchPubMed({
      provider: 'pubmed',
      query: 'lysC Escherichia coli',
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      locusTag: 'b4024',
      seedPmids,
      scope: 'seed_only',
      apiKey: 'ncbi-test-key',
      maxResult: 1,
    });

    expect(efetchChunkSizes).toEqual([20, 20, 11]);
    expect(esearchCalls).toBe(0);
    expect(result.sources).toHaveLength(51);
    expect(result.metadata.seedRetrievalComplete).toBe(true);
  });

  it('passes exact Gene-linked PMIDs through the provider factory in seed-only mode', async () => {
    const seedPmids = Array.from({ length: 38 }, (_, index) => String(8000000 + index));
    let esearchCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      if (url.pathname.endsWith('/esearch.fcgi')) {
        esearchCalls += 1;
        return new Response(JSON.stringify({ esearchresult: { idlist: [] } }), { status: 200 });
      }
      const ids = String(url.searchParams.get('id') || '').split(',').filter(Boolean);
      const records = ids.map(pmid => `
        <PubmedArticle><MedlineCitation><PMID>${pmid}</PMID><Article>
          <ArticleTitle>NCBI Gene-linked lysC study ${pmid}</ArticleTitle>
          <Abstract><AbstractText>Exact NCBI Gene-linked context for Escherichia coli.</AbstractText></Abstract>
        </Article></MedlineCitation></PubmedArticle>
      `).join('');
      return new Response(`<PubmedArticleSet>${records}</PubmedArticleSet>`, { status: 200 });
    }));

    const result = await createGeneSearchProvider({
      provider: 'pubmed',
      query: 'Exact NCBI Gene-linked bibliography',
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      locusTag: 'b4024',
      identityTerms: ['lysine-sensitive aspartokinase III'],
      seedPmids,
      scope: 'seed_only',
      maxResult: 1,
    });

    expect(esearchCalls).toBe(0);
    expect(result.sources.map(source => source.provenance?.recordId)).toEqual(seedPmids);
    expect(result.metadata).toMatchObject({
      seedPmidsRequested: 38,
      seedPmidsRetrieved: 38,
      seedRetrievalComplete: true,
    });
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

  it('resolves a stable protein accession before a provisional accession-shaped gene symbol', async () => {
    const reviewedEntry = {
      primaryAccession: 'P08660',
      uniProtkbId: 'LYSC_ECOLI',
      entryType: 'UniProtKB reviewed (Swiss-Prot)',
      proteinDescription: { recommendedName: { fullName: { value: 'Lysine-sensitive aspartokinase 3' } } },
      genes: [{ geneName: { value: 'lysC' }, orderedLocusNames: [{ value: 'b4024' }] }],
      organism: { scientificName: 'Escherichia coli (strain K12)', taxonId: 83333 },
      uniProtKBCrossReferences: [
        { database: 'RefSeq', id: 'NP_418448.1' },
        { database: 'GeneID', id: '948531' },
      ],
      sequence: { length: 449, molWeight: 48561 },
    };
    const attemptedQueries: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (rawUrl: string | URL) => {
      const url = new URL(String(rawUrl));
      const searchQuery = String(url.searchParams.get('query'));
      attemptedQueries.push(searchQuery);
      if (searchQuery === 'xref:RefSeq-NP_418448.1') {
        return new Response(JSON.stringify({ results: [reviewedEntry] }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }));

    const result = await searchUniProt({
      provider: 'uniprot',
      query: 'ignored',
      geneSymbol: 'NP_418448.1',
      proteinId: 'NP_418448.1',
      organism: 'Escherichia coli',
    });

    expect(attemptedQueries).toEqual([
      'accession:NP_418448.1',
      'xref:RefSeq-NP_418448.1',
    ]);
    expect(attemptedQueries.some(searchQuery => searchQuery.startsWith('gene_exact:'))).toBe(false);
    expect(result.sources[0]).toMatchObject({
      sourceId: 'UniProtKB:P08660',
      targetMatch: true,
      provenance: {
        actualGeneSymbol: 'lysC',
        matchedBy: expect.arrayContaining(['protein_id']),
      },
      annotation: { product: 'Lysine-sensitive aspartokinase 3', reviewed: true },
    });
  });

  it('falls back across NCBI and UniProt strain TaxIDs only when a stable CDS identifier matches', async () => {
    const exactEntry = {
      primaryAccession: 'P08660',
      uniProtkbId: 'LYSC_ECOLI',
      entryType: 'UniProtKB reviewed (Swiss-Prot)',
      proteinDescription: { recommendedName: { fullName: { value: 'Lysine-sensitive aspartokinase 3' } } },
      genes: [{ geneName: { value: 'lysC' }, orderedLocusNames: [{ value: 'b4024' }] }],
      organism: { scientificName: 'Escherichia coli (strain K12)', taxonId: 83333 },
      uniProtKBCrossReferences: [
        { database: 'RefSeq', id: 'NP_418448.1' },
        { database: 'GeneID', id: '948531' },
      ],
      sequence: { length: 449, molWeight: 48561 },
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [exactEntry] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchUniProt({
      provider: 'uniprot',
      query: 'ignored',
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      taxonId: 511145,
      locusTag: 'b4024',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(decodeURIComponent(String(fetchMock.mock.calls[0][0]))).toContain('organism_id:511145');
    expect(decodeURIComponent(String(fetchMock.mock.calls[1][0]))).toContain('organism_name:"Escherichia coli"');
    expect(result.sources[0]).toMatchObject({
      sourceId: 'UniProtKB:P08660',
      targetMatch: true,
      provenance: {
        matchedBy: expect.arrayContaining(['locus_tag', 'taxon_via_stable_identifier']),
      },
      annotation: { reviewed: true, product: 'Lysine-sensitive aspartokinase 3' },
    });
  });

  it('binds an exact KEGG locus entry as structured target authority', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      'eco:b4024\tlysC; aspartokinase 3 (EC: 2.7.2.4)\n',
      { status: 200 },
    )));

    const result = await searchKEGG({
      provider: 'kegg',
      query: 'ignored',
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      locusTag: 'b4024',
    });

    expect(result.sources[0]).toMatchObject({
      sourceId: 'KEGG:eco:b4024',
      targetMatch: true,
      provenance: { recordId: 'eco:b4024', matchedBy: ['locus_tag', 'organism_code'] },
      annotation: { ecNumbers: ['2.7.2.4'], dbXrefs: ['KEGG:eco:b4024'] },
      structuredData: {
        geneBasicInfo: { geneSymbol: 'lysC', alternativeNames: ['b4024'] },
        functionalData: { enzymeClassification: '2.7.2.4' },
      },
    });
  });

  it('reports upstream HTTP failures instead of presenting them as a clean empty search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })));
    const result = await searchPubMed({ provider: 'pubmed', query: 'thrB', geneSymbol: 'thrB', organism: 'Escherichia coli' });
    expect(result.sources).toEqual([]);
    expect(result.metadata.error).toContain('HTTP 429');
  });
});
