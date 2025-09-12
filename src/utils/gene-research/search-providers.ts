// Gene-specific search providers and database integrations
// Specialized search capabilities for molecular biology databases

import { completePath } from "@/utils/url";

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
  apiKey
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
      { headers }
    );
    
    const searchData = await searchResponse.json();
    const pmids = searchData.esearchresult?.idlist || [];

    if (pmids.length === 0) {
      return { sources: [], images: [], metadata: { totalResults: 0, database: 'pubmed', searchTime: 0 } };
    }

    // Fetch detailed information for each PMID
    const fetchResponse = await fetch(
      `${GENE_DATABASE_URLS.NCBI_EUTILS}efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml&rettype=abstract`,
      { headers }
    );

    const fetchData = await fetchResponse.text();
    const sources = parsePubMedResults(fetchData, geneSymbol, organism);

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
  apiKey
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
      { headers }
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
  apiKey
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
      { headers }
    );

    const data = await response.json();
    const geneIds = data.esearchresult?.idlist || [];

    if (geneIds.length === 0) {
      return { sources: [], images: [], metadata: { totalResults: 0, database: 'ncbi_gene', searchTime: 0 } };
    }

    // Fetch detailed gene information
    const fetchResponse = await fetch(
      `${GENE_DATABASE_URLS.NCBI_EUTILS}efetch.fcgi?db=gene&id=${geneIds.join(',')}&retmode=xml`,
      { headers }
    );

    const fetchData = await fetchResponse.text();
    const sources = parseNCBIGeneResults(fetchData, geneSymbol, organism);

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
  apiKey
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
      { headers }
    );

    const data = await response.json();
    const gdsIds = data.esearchresult?.idlist || [];

    if (gdsIds.length === 0) {
      return { sources: [], images: [], metadata: { totalResults: 0, database: 'geo', searchTime: 0 } };
    }

    // Fetch detailed GEO information
    const fetchResponse = await fetch(
      `${GENE_DATABASE_URLS.GEO_API}efetch.fcgi?db=gds&id=${gdsIds.join(',')}&retmode=xml`,
      { headers }
    );

    const fetchData = await fetchResponse.text();
    const sources = parseGEOResults(fetchData, geneSymbol, organism);

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
  apiKey
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
      { headers }
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
    console.error('PDB search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'pdb', searchTime: 0 } };
  }
}

// KEGG pathway search provider
export async function searchKEGG({
  query,
  geneSymbol,
  organism,
  maxResult = 10,
  apiKey
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
      `${GENE_DATABASE_URLS.KEGG_API}search/genes/${encodeURIComponent(searchQuery)}`,
      { headers }
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
    console.error('KEGG search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'kegg', searchTime: 0 } };
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
  scope
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const searchOptions = {
    provider,
    baseURL,
    apiKey,
    query,
    geneSymbol,
    organism,
    maxResult,
    scope
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
    default:
      throw new Error(`Unsupported gene research provider: ${provider}`);
  }
}

// Helper functions for parsing database results
function parsePubMedResults(xmlData: string, geneSymbol?: string, organism?: string): GeneSource[] {
  // Parse PubMed XML and extract relevant information
  // This is a simplified implementation - in practice, you'd use a proper XML parser
  const sources: GeneSource[] = [];
  
  // Extract PMID, title, abstract, authors, journal, year from XML
  // This is a placeholder - implement proper XML parsing
  
  return sources;
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
  // Parse NCBI Gene XML and extract relevant information
  const sources: GeneSource[] = [];
  
  // Extract gene information from XML
  // This is a placeholder - implement proper XML parsing
  
  return sources;
}

function parseGEOResults(xmlData: string, geneSymbol?: string, organism?: string): GeneSource[] {
  // Parse GEO XML and extract relevant information
  const sources: GeneSource[] = [];
  
  // Extract expression data from XML
  // This is a placeholder - implement proper XML parsing
  
  return sources;
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
  // Parse KEGG results and extract pathway information
  const sources: GeneSource[] = [];
  
  // Extract pathway information from KEGG response
  // This is a placeholder - implement proper parsing
  
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
    }
    
    return Math.min(score, 1.0);
  });
  
  return scores.reduce((sum, score) => sum + score, 0) / scores.length;
}
