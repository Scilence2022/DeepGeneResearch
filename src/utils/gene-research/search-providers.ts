// Gene-specific search providers and database integrations
// Specialized search capabilities for molecular biology databases

import { createFetchSignal } from '@/utils/fetch-signal';

// Database URLs and configurations
const GENE_DATABASE_URLS = {
  NCBI_EUTILS: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/",
  UNIPROT_API: "https://rest.uniprot.org/",
  GEO_API: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/",
  PDB_API: "https://data.rcsb.org/",
  KEGG_API: "https://rest.kegg.jp/",
  GO_API: "https://api.geneontology.org/",
  STRING_API: "https://string-db.org/api/",
  OMIM_API: "https://api.omim.org/",
  ENSEMBL_API: "https://rest.ensembl.org/",
  REACTOME_API: "https://reactome.org/ContentService/",
};

export interface GeneSearchProviderOptions {
  provider: string;
  baseURL?: string;
  apiKey?: string;
  query: string;
  geneSymbol?: string;
  organism?: string;
  maxResult?: number;
  scope?: string;
  signal?: AbortSignal;
}

export interface GeneSearchResult {
  sources: GeneSource[];
  images: GeneImage[];
  metadata: GeneSearchMetadata;
}

export interface GeneSource {
  title: string;
  content: string;
  url: string;
  database: string;
  geneSymbol?: string;
  organism?: string;
  confidence?: number;
  evidence?: string[];
  type: 'literature' | 'protein' | 'expression' | 'interaction' | 'disease' | 'pathway' | 'structure';
}

export interface GeneImage {
  url: string;
  description: string;
  type: 'structure' | 'pathway' | 'expression' | 'interaction' | 'other';
  geneSymbol?: string;
  organism?: string;
}

export interface GeneSearchMetadata {
  totalResults: number;
  database: string;
  searchTime: number;
  geneSymbol?: string;
  organism?: string;
  qualityScore?: number;
}

// PubMed search provider for literature
export async function searchPubMed({
  query,
  geneSymbol,
  organism,
  maxResult = 20,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    // Search for gene-related publications
    const searchQuery = geneSymbol && organism 
      ? `${geneSymbol}[Gene Name] AND ${organism}[Organism] AND ${query}`
      : `${query}`;

    const searchResponse = await fetch(
      `${GENE_DATABASE_URLS.NCBI_EUTILS}esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchQuery)}&retmax=${maxResult}&retmode=json`,
      { headers, signal: createFetchSignal(signal) }
    );
    
    const searchData = await searchResponse.json();
    const pmids = searchData.esearchresult?.idlist || [];

    if (pmids.length === 0) {
      return { sources: [], images: [], metadata: { totalResults: 0, database: 'pubmed', searchTime: 0 } };
    }

    // Fetch detailed information for each PMID
    const detailResponse = await fetch(
      `${GENE_DATABASE_URLS.NCBI_EUTILS}efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml&rettype=abstract`,
      { headers, signal: createFetchSignal(signal) }
    );
    const xmlData = await detailResponse.text();

    const sources = parsePubMedResults(xmlData, geneSymbol, organism);

    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'pubmed',
        searchTime: Date.now(),
        geneSymbol,
        organism,
        qualityScore: calculateQualityScore(sources)
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    console.error('PubMed search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'pubmed', searchTime: 0 } };
  }
}

// UniProt search provider for protein information
export async function searchUniProt({
  query,
  geneSymbol,
  organism,
  maxResult = 10,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const searchQuery = geneSymbol && organism 
      ? `gene:${geneSymbol} AND organism:${organism} AND ${query}`
      : query;

    const response = await fetch(
      `${GENE_DATABASE_URLS.UNIPROT_API}uniprotkb/search?query=${encodeURIComponent(searchQuery)}&format=json&size=${maxResult}`,
      { headers, signal: createFetchSignal(signal) }
    );

    const data = await response.json();
    const sources = parseUniProtResults(data.results || [], geneSymbol, organism);

    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'uniprot',
        searchTime: Date.now(),
        geneSymbol,
        organism,
        qualityScore: calculateQualityScore(sources)
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    console.error('UniProt search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'uniprot', searchTime: 0 } };
  }
}

// NCBI Gene search provider
export async function searchNCBIGene({
  query,
  geneSymbol,
  organism,
  maxResult = 10,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const searchQuery = geneSymbol && organism 
      ? `${geneSymbol}[Gene Name] AND ${organism}[Organism]`
      : query;

    const response = await fetch(
      `${GENE_DATABASE_URLS.NCBI_EUTILS}esearch.fcgi?db=gene&term=${encodeURIComponent(searchQuery)}&retmax=${maxResult}&retmode=json`,
      { headers, signal: createFetchSignal(signal) }
    );

    const data = await response.json();
    const geneIds = data.esearchresult?.idlist || [];

    if (geneIds.length === 0) {
      return { sources: [], images: [], metadata: { totalResults: 0, database: 'ncbi_gene', searchTime: 0 } };
    }

    // Fetch detailed gene information
    const detailResponse = await fetch(
      `${GENE_DATABASE_URLS.NCBI_EUTILS}efetch.fcgi?db=gene&id=${geneIds.join(',')}&retmode=xml`,
      { headers, signal: createFetchSignal(signal) }
    );
    const xmlData = await detailResponse.text();

    const sources = parseNCBIGeneResults(xmlData, geneSymbol, organism);

    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'ncbi_gene',
        searchTime: Date.now(),
        geneSymbol,
        organism,
        qualityScore: calculateQualityScore(sources)
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    console.error('NCBI Gene search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'ncbi_gene', searchTime: 0 } };
  }
}

// GEO (Gene Expression Omnibus) search provider
export async function searchGEO({
  query,
  geneSymbol,
  organism,
  maxResult = 15,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const searchQuery = geneSymbol && organism 
      ? `${geneSymbol}[Gene Symbol] AND ${organism}[Organism] AND ${query}`
      : query;

    const response = await fetch(
      `${GENE_DATABASE_URLS.GEO_API}esearch.fcgi?db=gds&term=${encodeURIComponent(searchQuery)}&retmax=${maxResult}&retmode=json`,
      { headers, signal: createFetchSignal(signal) }
    );

    const data = await response.json();
    const gdsIds = data.esearchresult?.idlist || [];

    if (gdsIds.length === 0) {
      return { sources: [], images: [], metadata: { totalResults: 0, database: 'geo', searchTime: 0 } };
    }

    // Fetch detailed GEO information
    const detailResponse = await fetch(
      `${GENE_DATABASE_URLS.GEO_API}efetch.fcgi?db=gds&id=${gdsIds.join(',')}&retmode=xml`,
      { headers, signal: createFetchSignal(signal) }
    );
    const xmlData = await detailResponse.text();

    const sources = parseGEOResults(xmlData, geneSymbol, organism);

    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'geo',
        searchTime: Date.now(),
        geneSymbol,
        organism,
        qualityScore: calculateQualityScore(sources)
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    console.error('GEO search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'geo', searchTime: 0 } };
  }
}

// PDB (Protein Data Bank) search provider
export async function searchPDB({
  query,
  geneSymbol,
  organism,
  maxResult = 10,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const searchQuery = geneSymbol 
      ? `${geneSymbol} AND ${query}`
      : query;

    const response = await fetch(
      `${GENE_DATABASE_URLS.PDB_API}search?q=${encodeURIComponent(searchQuery)}&rows=${maxResult}&format=json`,
      { headers, signal: createFetchSignal(signal) }
    );

    const data = await response.json();
    const sources = parsePDBResults(data.result?.docs || [], geneSymbol, organism);

    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'pdb',
        searchTime: Date.now(),
        geneSymbol,
        organism,
        qualityScore: calculateQualityScore(sources)
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    console.error('PDB search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'pdb', searchTime: 0 } };
  }
}

// KEGG pathway search provider
export async function searchKEGG({
  query,
  geneSymbol,
  organism,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const searchQuery = geneSymbol 
      ? `${geneSymbol} AND ${query}`
      : query;

    const response = await fetch(
      `${GENE_DATABASE_URLS.KEGG_API}find/genes/${encodeURIComponent(searchQuery)}`,
      { headers, signal: createFetchSignal(signal) }
    );

    const data = await response.text();
    const sources = parseKEGGResults(data, geneSymbol, organism);

    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'kegg',
        searchTime: Date.now(),
        geneSymbol,
        organism,
        qualityScore: calculateQualityScore(sources)
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    console.error('KEGG search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'kegg', searchTime: 0 } };
  }
}

// STRING protein interaction search provider
export async function searchSTRING({
  query,
  geneSymbol,
  organism,
  maxResult = 10,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const searchQuery = geneSymbol 
      ? `${geneSymbol} AND ${query}`
      : query;

    const response = await fetch(
      `${GENE_DATABASE_URLS.STRING_API}tsv/network?identifiers=${encodeURIComponent(searchQuery)}&species=${organism || '9606'}&limit=${maxResult}`,
      { headers, signal: createFetchSignal(signal) }
    );

    const data = await response.text();
    const sources = parseSTRINGResults(data, geneSymbol, organism);

    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'string',
        searchTime: Date.now(),
        geneSymbol,
        organism,
        qualityScore: calculateQualityScore(sources)
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    console.error('STRING search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'string', searchTime: 0 } };
  }
}

// OMIM disease association search provider
export async function searchOMIM({
  query,
  geneSymbol,
  organism,
  maxResult = 10,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const searchQuery = geneSymbol 
      ? `${geneSymbol} AND ${query}`
      : query;

    const response = await fetch(
      `${GENE_DATABASE_URLS.OMIM_API}entry/search?search=${encodeURIComponent(searchQuery)}&limit=${maxResult}&format=json`,
      { headers, signal: createFetchSignal(signal) }
    );

    const data = await response.json();
    const sources = parseOMIMResults(data, geneSymbol, organism);

    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'omim',
        searchTime: Date.now(),
        geneSymbol,
        organism,
        qualityScore: calculateQualityScore(sources)
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    console.error('OMIM search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'omim', searchTime: 0 } };
  }
}

// Ensembl gene annotation search provider
export async function searchEnsembl({
  query,
  geneSymbol,
  organism,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const searchQuery = geneSymbol 
      ? `${geneSymbol} AND ${query}`
      : query;

    const response = await fetch(
      `${GENE_DATABASE_URLS.ENSEMBL_API}lookup/symbol/homo_sapiens/${encodeURIComponent(searchQuery)}?expand=1`,
      { headers, signal: createFetchSignal(signal) }
    );

    const data = await response.json();
    const sources = parseEnsemblResults(data, geneSymbol, organism);

    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'ensembl',
        searchTime: Date.now(),
        geneSymbol,
        organism,
        qualityScore: calculateQualityScore(sources)
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    console.error('Ensembl search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'ensembl', searchTime: 0 } };
  }
}

// Reactome pathway search provider
export async function searchReactome({
  query,
  geneSymbol,
  organism,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const searchQuery = geneSymbol 
      ? `${geneSymbol} AND ${query}`
      : query;

    const response = await fetch(
      `${GENE_DATABASE_URLS.REACTOME_API}search/query?query=${encodeURIComponent(searchQuery)}&species=${organism || 'Homo sapiens'}`,
      { headers, signal: createFetchSignal(signal) }
    );

    const data = await response.json();
    const sources = parseReactomeResults(data, geneSymbol, organism);

    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'reactome',
        searchTime: Date.now(),
        geneSymbol,
        organism,
        qualityScore: calculateQualityScore(sources)
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    console.error('Reactome search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'reactome', searchTime: 0 } };
  }
}

// Main gene search provider factory
export async function createGeneSearchProvider({
  provider,
  baseURL,
  apiKey = "",
  query,
  geneSymbol,
  organism,
  maxResult = 10,
  scope,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const searchOptions = {
    provider,
    baseURL,
    apiKey,
    query,
    geneSymbol,
    organism,
    maxResult,
    scope,
    signal,
  };

  switch (provider) {
    case "pubmed":
      return searchPubMed(searchOptions);
    case "uniprot":
      return searchUniProt(searchOptions);
    case "ncbi_gene":
      return searchNCBIGene(searchOptions);
    case "geo":
      return searchGEO(searchOptions);
    case "pdb":
      return searchPDB(searchOptions);
    case "kegg":
      return searchKEGG(searchOptions);
    case "string":
      return searchSTRING(searchOptions);
    case "omim":
      return searchOMIM(searchOptions);
    case "ensembl":
      return searchEnsembl(searchOptions);
    case "reactome":
      return searchReactome(searchOptions);
    default:
      throw new Error(`Unsupported gene research provider: ${provider}`);
  }
}

// Helper functions for parsing database results
function decodeXml(value = ''): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripXmlTags(value = ''): string {
  return decodeXml(value.replace(/<[^>]+>/g, ' '));
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? stripXmlTags(match[1]) : '';
}

function extractAllTags(xml: string, tag: string): string[] {
  return Array.from(xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'gi')))
    .map((match) => stripXmlTags(match[1]))
    .filter(Boolean);
}

function splitXmlBlocks(xml: string, tag: string): string[] {
  return Array.from(xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, 'gi')))
    .map((match) => match[0]);
}

function parsePubMedResults(xmlData: string, geneSymbol?: string, organism?: string): GeneSource[] {
  return splitXmlBlocks(xmlData, 'PubmedArticle').map((article) => {
    const pmid = extractTag(article, 'PMID');
    const title = extractTag(article, 'ArticleTitle') || `PubMed article ${pmid || 'unknown'}`;
    const abstract = extractAllTags(article, 'AbstractText').join(' ');
    const journal = extractTag(article, 'ISOAbbreviation') || extractTag(article, 'Title');
    const year = extractTag(article, 'Year');
    const authors = splitXmlBlocks(article, 'Author')
      .map((author) => [extractTag(author, 'ForeName'), extractTag(author, 'LastName')].filter(Boolean).join(' '))
      .filter(Boolean)
      .slice(0, 6);

    return {
      title,
      content: [
        authors.length ? `Authors: ${authors.join(', ')}` : '',
        journal ? `Journal: ${journal}` : '',
        year ? `Year: ${year}` : '',
        abstract || 'No abstract available from PubMed efetch.'
      ].filter(Boolean).join('\n'),
      url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : 'https://pubmed.ncbi.nlm.nih.gov/',
      database: 'pubmed',
      geneSymbol,
      organism,
      confidence: 0.9,
      evidence: ['literature', pmid ? `PMID:${pmid}` : 'pubmed'],
      type: 'literature' as const
    };
  });
}

function parseUniProtResults(results: any[], geneSymbol?: string, organism?: string): GeneSource[] {
  return results.map(result => ({
    title: result.proteinDescription?.recommendedName?.fullName?.value || result.uniProtkbId,
    content: `Protein: ${result.proteinDescription?.recommendedName?.fullName?.value || 'Unknown'}
Gene: ${result.geneNames?.[0]?.geneName?.value || 'Unknown'}
Organism: ${result.organism?.scientificName || 'Unknown'}
Function: ${result.comments?.find((c: any) => c.commentType === 'FUNCTION')?.text?.[0]?.value || 'Unknown'}
Subcellular location: ${result.comments?.find((c: any) => c.commentType === 'SUBCELLULAR_LOCATION')?.text?.[0]?.value || 'Unknown'}`,
    url: `https://www.uniprot.org/uniprot/${result.uniProtkbId}`,
    database: 'uniprot',
    geneSymbol: geneSymbol,
    organism: organism,
    confidence: 0.9,
    evidence: ['database'],
    type: 'protein' as const
  }));
}

function parseNCBIGeneResults(xmlData: string, geneSymbol?: string, organism?: string): GeneSource[] {
  return splitXmlBlocks(xmlData, 'Entrezgene').map((gene) => {
    const geneId = extractTag(gene, 'Gene-track_geneid');
    const locus = extractTag(gene, 'Gene-ref_locus') || geneSymbol || geneId || 'Unknown gene';
    const description = extractTag(gene, 'Gene-ref_desc');
    const summary = extractTag(gene, 'Entrezgene_summary');

    return {
      title: `${locus}${description ? ` - ${description}` : ''}`,
      content: [
        geneId ? `NCBI Gene ID: ${geneId}` : '',
        description ? `Description: ${description}` : '',
        summary ? `Summary: ${summary}` : ''
      ].filter(Boolean).join('\n') || 'NCBI Gene record returned without a parsed summary.',
      url: geneId ? `https://www.ncbi.nlm.nih.gov/gene/${geneId}` : 'https://www.ncbi.nlm.nih.gov/gene/',
      database: 'ncbi_gene',
      geneSymbol,
      organism,
      confidence: 0.9,
      evidence: ['database', geneId ? `GeneID:${geneId}` : 'ncbi_gene'],
      type: 'protein' as const
    };
  });
}

function parseGEOResults(xmlData: string, geneSymbol?: string, organism?: string): GeneSource[] {
  const blocks = splitXmlBlocks(xmlData, 'DocSum').length > 0
    ? splitXmlBlocks(xmlData, 'DocSum')
    : splitXmlBlocks(xmlData, 'DocumentSummary');

  return blocks.map((record) => {
    const id = extractTag(record, 'Id') || extractTag(record, 'Accession');
    const title = extractTag(record, 'Title') || extractTag(record, 'title') || `GEO dataset ${id || 'unknown'}`;
    const summary = extractTag(record, 'Summary') || extractTag(record, 'summary');

    return {
      title,
      content: [
        id ? `GEO ID: ${id}` : '',
        summary || 'No GEO summary parsed from NCBI response.'
      ].filter(Boolean).join('\n'),
      url: id ? `https://www.ncbi.nlm.nih.gov/geo/query/acc.cgi?acc=${id}` : 'https://www.ncbi.nlm.nih.gov/geo/',
      database: 'geo',
      geneSymbol,
      organism,
      confidence: 0.75,
      evidence: ['expression'],
      type: 'expression' as const
    };
  });
}

function parsePDBResults(results: any[], geneSymbol?: string, organism?: string): GeneSource[] {
  return results.map(result => ({
    title: `${result.struct.title || 'Unknown'} (${result.struct.pdbx_descriptor || 'Unknown'})`,
    content: `PDB ID: ${result.struct.pdbx_descriptor}
Title: ${result.struct.title || 'Unknown'}
Method: ${result.struct.exptl?.[0]?.method || 'Unknown'}
Resolution: ${result.struct.refine?.[0]?.ls_d_res_high || 'Unknown'}
Organism: ${result.struct.entity_src_gen?.[0]?.pdbx_gene_src_scientific_name || 'Unknown'}`,
    url: `https://www.rcsb.org/structure/${result.struct.pdbx_descriptor}`,
    database: 'pdb',
    geneSymbol: geneSymbol,
    organism: organism,
    confidence: 0.8,
    evidence: ['structure'],
    type: 'structure' as const
  }));
}

function parseKEGGResults(data: string, geneSymbol?: string, organism?: string): GeneSource[] {
  return data
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [entry, description = ''] = line.split('\t');
      return {
        title: `${entry}: ${description.split(';')[0] || geneSymbol || 'KEGG gene match'}`,
        content: `KEGG entry: ${entry}\nDescription: ${description || 'No KEGG description returned.'}`,
        url: `https://www.genome.jp/entry/${encodeURIComponent(entry)}`,
        database: 'kegg',
        geneSymbol,
        organism,
        confidence: 0.8,
        evidence: ['pathway', 'database'],
        type: 'pathway' as const
      };
    });
}

function parseOMIMResults(data: any, geneSymbol?: string, organism?: string): GeneSource[] {
  const entries = data?.omim?.searchResponse?.entryList || data?.entryList || [];

  return entries.map((item: any) => {
    const entry = item.entry || item;
    const mimNumber = entry.mimNumber || entry.prefix || '';
    const title = entry.titles?.preferredTitle || entry.title || `OMIM entry ${mimNumber || ''}`.trim();

    return {
      title,
      content: [
        mimNumber ? `MIM number: ${mimNumber}` : '',
        entry.geneMap?.phenotypeMapList ? `Phenotype mappings: ${entry.geneMap.phenotypeMapList.length}` : '',
      ].filter(Boolean).join('\n') || 'OMIM search match.',
      url: mimNumber ? `https://www.omim.org/entry/${mimNumber}` : 'https://www.omim.org/',
      database: 'omim',
      geneSymbol,
      organism,
      confidence: 0.82,
      evidence: ['disease', 'database'],
      type: 'disease' as const
    };
  });
}

function parseSTRINGResults(data: string, geneSymbol?: string, organism?: string): GeneSource[] {
  const lines = data.split('\n').filter(Boolean);
  const header = lines.shift()?.split('\t') || [];

  return lines.map((line) => {
    const values = line.split('\t');
    const record = Object.fromEntries(header.map((key, index) => [key, values[index]]));
    const preferredNameA = record.preferredName_A || values[2] || geneSymbol || 'Protein A';
    const preferredNameB = record.preferredName_B || values[3] || 'Protein B';
    const score = record.score || record.combined_score || values[5] || values[13] || 'unknown';

    return {
      title: `${preferredNameA} - ${preferredNameB} interaction`,
      content: `STRING interaction: ${preferredNameA} with ${preferredNameB}\nScore: ${score}`,
      url: 'https://string-db.org/',
      database: 'string',
      geneSymbol,
      organism,
      confidence: Number.isFinite(Number(score)) ? Math.min(Number(score), 1) : 0.75,
      evidence: ['interaction'],
      type: 'interaction' as const
    };
  });
}



function parseEnsemblResults(data: any, geneSymbol?: string, organism?: string): GeneSource[] {
  // Parse Ensembl results and extract gene annotation information
  const sources: GeneSource[] = [];
  
  if (data.id) {
    sources.push({
      title: `${data.display_name || data.id} (${data.biotype})`,
      content: `Gene ID: ${data.id}
Display Name: ${data.display_name || 'Unknown'}
Biotype: ${data.biotype || 'Unknown'}
Description: ${data.description || 'Unknown'}
Chromosome: ${data.seq_region_name || 'Unknown'}
Start: ${data.start || 'Unknown'}
End: ${data.end || 'Unknown'}`,
      url: `https://www.ensembl.org/Gene/Summary?g=${data.id}`,
      database: 'ensembl',
      geneSymbol: geneSymbol,
      organism: organism,
      confidence: 0.95,
      evidence: ['annotation'],
      type: 'protein' as const
    });
  }
  
  return sources;
}

function parseReactomeResults(data: any, geneSymbol?: string, organism?: string): GeneSource[] {
  // Parse Reactome results and extract pathway information
  const sources: GeneSource[] = [];
  
  if (data.results) {
    data.results.forEach((result: any) => {
      sources.push({
        title: `${result.name} (${result.stId})`,
        content: `Pathway: ${result.name}
Reactome ID: ${result.stId}
Species: ${result.species?.[0]?.displayName || 'Unknown'}
Description: ${result.summary || 'Unknown'}`,
        url: `https://reactome.org/content/detail/${result.stId}`,
        database: 'reactome',
        geneSymbol: geneSymbol,
        organism: organism,
        confidence: 0.85,
        evidence: ['pathway'],
        type: 'pathway' as const
      });
    });
  }
  
  return sources;
}

function calculateQualityScore(sources: GeneSource[]): number {
  if (sources.length === 0) return 0;
  
  const scores = sources.map(source => {
    let score = 0.5; // base score
    
    // Higher confidence sources get better scores
    if (source.confidence) score += source.confidence * 0.3;
    
    // More evidence means higher quality
    if (source.evidence && source.evidence.length > 0) score += Math.min(source.evidence.length * 0.1, 0.2);
    
    // Database-specific quality adjustments
    switch (source.database) {
      case 'pubmed':
        score += 0.1; // Literature is highly valued
        break;
      case 'uniprot':
        score += 0.15; // Curated protein data is very reliable
        break;
      case 'pdb':
        score += 0.1; // Structural data is valuable
        break;
      case 'string':
        score += 0.08; // Protein interactions are valuable
        break;
      case 'omim':
        score += 0.12; // Disease associations are highly reliable
        break;
      case 'ensembl':
        score += 0.1; // Gene annotations are reliable
        break;
      case 'reactome':
        score += 0.09; // Pathway data is valuable
        break;
      case 'kegg':
        score += 0.08; // Pathway data is valuable
        break;
      case 'geo':
        score += 0.07; // Expression data is valuable
        break;
      case 'ncbi_gene':
        score += 0.1; // Gene information is reliable
        break;
    }
    
    return Math.min(score, 1.0);
  });
  
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
