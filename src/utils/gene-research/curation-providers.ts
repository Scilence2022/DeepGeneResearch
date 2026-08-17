// Curation-focused data sources for genome annotation review.
//
// These providers supply the evidence CodeXomics annotation proposals most
// need: GO annotations (QuickGO via the Gene Ontology API), protein domain
// architecture (InterPro), experimentally reported interactions (IntAct),
// and recent preprint literature (Europe PMC preprint abstracts).

import { createFetchSignal } from '@/utils/fetch-signal';
import type { GeneSearchProviderOptions, GeneSearchResult, GeneSource } from './search-providers';

const CURATION_API_URLS = {
  GENE_ONTOLOGY: 'https://api.geneontology.org/',
  INTERPRO: 'https://www.ebi.ac.uk/interpro/api/',
  INTACT: 'https://www.ebi.ac.uk/intact/rest/',
  EUROPE_PMC: 'https://www.ebi.ac.uk/europepmc/webservices/rest/',
};

interface QuickGoOptions {
  geneSymbol?: string;
  taxonId?: string | number;
  maxResult?: number;
  signal?: AbortSignal;
}

function ncbiTaxonUri(taxonId: string | number | undefined): string | null {
  if (taxonId === undefined || taxonId === null || String(taxonId).trim() === '') return null;
  const numeric = String(taxonId).trim();
  if (/^\d+$/.test(numeric)) return `NCBITaxon:${numeric}`;
  if (/^NCBITaxon:\d+$/i.test(numeric)) return numeric;
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** GO annotations for the target gene resolved through the Gene Ontology API. */
export async function searchQuickGo({
  geneSymbol = '',
  taxonId,
  maxResult = 50,
  signal,
}: QuickGoOptions): Promise<GeneSearchResult> {
  const symbol = String(geneSymbol || '').trim();
  const taxonUri = ncbiTaxonUri(taxonId);
  if (!symbol || !taxonUri) {
    return {
      sources: [],
      images: [],
      metadata: {
        totalResults: 0,
        database: 'quickgo',
        searchTime: 0,
        geneSymbol: symbol,
        disabled: true,
        warnings: [!symbol ? 'missing gene symbol' : 'missing taxon id for GO bioentity lookup'],
      },
    };
  }
  try {
    const url = new URL(`${CURATION_API_URLS.GENE_ONTOLOGY}api/bioentity/gene/${encodeURIComponent(taxonUri)}/${encodeURIComponent(symbol)}/function`);
    url.searchParams.set('rows', String(Math.min(Math.max(maxResult, 1), 200)));
    const response = await fetch(url.toString(), { signal: createFetchSignal(signal) });
    if (!response.ok) {
      throw new Error(`GO API returned HTTP ${response.status}`);
    }
    const data = await response.json();
    const associations: any[] = Array.isArray(data?.associations) ? data.associations : [];
    const goTerms = Array.from(new Set(
      associations
        .map(association => association?.object?.id)
        .filter((id): id is string => typeof id === 'string' && /^GO:\d{7}$/.test(id)),
    ));
    const source: GeneSource = {
      title: `GO annotations for ${symbol}`,
      content: associations
        .map((association, index) => `${index + 1}. ${association?.object?.label || association?.object?.id} (${association?.relation?.label || association?.relation?.id})`)
        .join('\n')
        .slice(0, 20_000),
      url: url.toString(),
      database: 'quickgo',
      sourceId: taxonUri,
      geneSymbol: symbol,
      organism: '',
      confidence: 0.9,
      evidence: ['quickgo_go_annotation'],
      annotation: { goTerms },
      structuredData: { goTerms, associationCount: associations.length },
      type: 'protein',
    };
    return {
      sources: goTerms.length ? [source] : [],
      images: [],
      metadata: {
        totalResults: goTerms.length ? 1 : 0,
        database: 'quickgo',
        searchTime: Date.now(),
        geneSymbol: symbol,
        warnings: associations.length === 0 ? ['no GO associations returned for this gene/taxon'] : [],
      },
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      sources: [],
      images: [],
      metadata: {
        totalResults: 0,
        database: 'quickgo',
        searchTime: Date.now(),
        geneSymbol: symbol,
        error: errorMessage(error),
        warnings: [`QuickGO lookup failed: ${errorMessage(error)}`],
      },
    };
  }
}

/** Protein domain architecture from InterPro for an exact UniProt accession. */
export async function searchInterPro({
  proteinId,
  geneSymbol = '',
  maxResult = 30,
  signal,
}: { proteinId?: string; geneSymbol?: string; maxResult?: number; signal?: AbortSignal }): Promise<GeneSearchResult> {
  const accession = String(proteinId || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(accession)) {
    return {
      sources: [],
      images: [],
      metadata: {
        totalResults: 0,
        database: 'interpro',
        searchTime: 0,
        geneSymbol,
        disabled: true,
        warnings: [accession ? `not a valid UniProt accession: ${accession}` : 'missing protein accession for InterPro lookup'],
      },
    };
  }
  try {
    const url = new URL(`${CURATION_API_URLS.INTERPRO}protein/uniprot/${encodeURIComponent(accession)}`);
    url.searchParams.set('page_size', String(Math.min(Math.max(maxResult, 1), 200)));
    const response = await fetch(url.toString(), { signal: createFetchSignal(signal) });
    if (!response.ok) {
      throw new Error(`InterPro API returned HTTP ${response.status}`);
    }
    const data = await response.json();
    const matches: any[] = Array.isArray(data?.protein?.matches) ? data.protein.matches : [];
    const dbXrefs = Array.from(new Set(
      matches
        .map((match: any) => match?.accession)
        .filter((id: unknown): id is string => typeof id === 'string' && /^IPR\d+$/.test(id)),
    ));
    const source: GeneSource = {
      title: `InterPro domains for ${accession}`,
      content: matches
        .map((match: any, index: number) => `${index + 1}. ${match?.accession || 'IPR'} (${match?.source_database || 'unknown'}) ${match?.protein?.entry_protein_locations?.[0]?.fragments?.[0]?.start ?? ''}-${match?.protein?.entry_protein_locations?.[0]?.fragments?.[0]?.end ?? ''}`)
        .join('\n')
        .slice(0, 20_000),
      url: url.toString(),
      database: 'interpro',
      sourceId: accession,
      geneSymbol,
      organism: '',
      confidence: 0.9,
      evidence: ['interpro_domain_architecture'],
      annotation: { dbXrefs },
      structuredData: { dbXrefs, matchCount: matches.length },
      type: 'structure',
    };
    return {
      sources: dbXrefs.length ? [source] : [],
      images: [],
      metadata: {
        totalResults: dbXrefs.length ? 1 : 0,
        database: 'interpro',
        searchTime: Date.now(),
        geneSymbol,
        warnings: matches.length === 0 ? ['no InterPro matches for this accession'] : [],
      },
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      sources: [],
      images: [],
      metadata: {
        totalResults: 0,
        database: 'interpro',
        searchTime: Date.now(),
        geneSymbol,
        error: errorMessage(error),
        warnings: [`InterPro lookup failed: ${errorMessage(error)}`],
      },
    };
  }
}

/** Experimentally reported protein interactions from IntAct. */
export async function searchIntAct({
  geneSymbol = '',
  taxonId,
  maxResult = 50,
  signal,
}: { geneSymbol?: string; taxonId?: string | number; maxResult?: number; signal?: AbortSignal }): Promise<GeneSearchResult> {
  const symbol = String(geneSymbol || '').trim();
  if (!symbol) {
    return {
      sources: [],
      images: [],
      metadata: {
        totalResults: 0,
        database: 'intact',
        searchTime: 0,
        geneSymbol: symbol,
        disabled: true,
        warnings: ['missing gene symbol for IntAct lookup'],
      },
    };
  }
  try {
    const taxid = /^\d+$/.test(String(taxonId || '').trim()) ? String(taxonId).trim() : undefined;
    const url = `${CURATION_API_URLS.INTACT}interactor/findInteractions/${encodeURIComponent(symbol)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: symbol,
        ...(taxid ? { taxid } : {}),
        page: 0,
        pageSize: Math.min(Math.max(maxResult, 1), 100),
      }),
      signal: createFetchSignal(signal),
    });
    if (!response.ok) {
      throw new Error(`IntAct API returned HTTP ${response.status}`);
    }
    const data = await response.json();
    const interactions: any[] = Array.isArray(data?.binaryInteractionMap) ? data.binaryInteractionMap : [];
    const partners = Array.from(new Set(
      interactions.flatMap((entry: any) => [
        entry?.interactorA?.preferredName,
        entry?.interactorB?.preferredName,
      ]).filter((name: unknown): name is string => typeof name === 'string' && name !== '-'),
    ));
    const source: GeneSource = {
      title: `IntAct interactions for ${symbol}`,
      content: interactions
        .map((entry: any, index: number) => `${index + 1}. ${entry?.interactorA?.preferredName || '?'} - ${entry?.interactorB?.preferredName || '?'} (${entry?.interaction?.interactionTypeName || 'interaction'})`)
        .join('\n')
        .slice(0, 20_000),
      url: `https://www.ebi.ac.uk/intact/search?query=${encodeURIComponent(symbol)}`,
      database: 'intact',
      sourceId: symbol,
      geneSymbol: symbol,
      organism: '',
      confidence: 0.8,
      evidence: ['intact_interaction'],
      structuredData: { partners, interactionCount: interactions.length },
      type: 'interaction',
    };
    return {
      sources: interactions.length ? [source] : [],
      images: [],
      metadata: {
        totalResults: interactions.length ? 1 : 0,
        database: 'intact',
        searchTime: Date.now(),
        geneSymbol: symbol,
        warnings: interactions.length === 0 ? ['no interactions reported for this gene'] : [],
      },
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      sources: [],
      images: [],
      metadata: {
        totalResults: 0,
        database: 'intact',
        searchTime: Date.now(),
        geneSymbol: symbol,
        error: errorMessage(error),
        warnings: [`IntAct lookup failed: ${errorMessage(error)}`],
      },
    };
  }
}

/** bioRxiv/medRxiv preprint abstracts through the Europe PMC preprint corpus. */
export async function searchEuropePmcPreprints({
  query,
  geneSymbol = '',
  organism = '',
  identityTerms = [],
  maxResult = 25,
  signal,
}: Pick<GeneSearchProviderOptions, 'query' | 'geneSymbol' | 'organism' | 'identityTerms' | 'maxResult' | 'signal'>): Promise<GeneSearchResult> {
  const symbol = String(geneSymbol || '').trim();
  if (!symbol) {
    return {
      sources: [],
      images: [],
      metadata: {
        totalResults: 0,
        database: 'europepmc_preprints',
        searchTime: 0,
        geneSymbol: symbol,
        disabled: true,
        warnings: ['missing gene symbol for preprint lookup'],
      },
    };
  }
  try {
    const identityClause = Array.from(new Set([symbol, ...(identityTerms || [])]))
      .map(term => `"${String(term).replace(/"/g, '')}"`)
      .join(' OR ');
    const organismClause = String(organism || '').trim()
      ? ` AND ("${String(organism).replace(/"/g, '')}")`
      : '';
    const searchQuery = `(${identityClause})${organismClause} AND SRC:PPR`;
    const url = new URL(`${CURATION_API_URLS.EUROPE_PMC}search`);
    url.searchParams.set('query', searchQuery);
    url.searchParams.set('format', 'json');
    url.searchParams.set('resultType', 'lite');
    url.searchParams.set('pageSize', String(Math.min(Math.max(maxResult, 1), 100)));
    const response = await fetch(url.toString(), { signal: createFetchSignal(signal) });
    if (!response.ok) {
      throw new Error(`Europe PMC API returned HTTP ${response.status}`);
    }
    const data = await response.json();
    const results: any[] = Array.isArray(data?.resultList?.result) ? data.resultList.result : [];
    const sources: GeneSource[] = results
      .filter((item: any) => item?.abstractText && item?.title)
      .map((item: any) => ({
        title: String(item.title),
        content: String(item.abstractText).slice(0, 4_000),
        url: item.doi
          ? `https://doi.org/${item.doi}`
          : `https://europepmc.org/article/PPR/${item.id}`,
        database: 'europepmc_preprints',
        sourceId: String(item.id || ''),
        geneSymbol: symbol,
        organism: String(organism || ''),
        confidence: 0.6,
        evidence: ['preprint_abstract'],
        structuredData: {
          doi: item.doi ? String(item.doi) : undefined,
          source: String(item.source || ''),
          authorString: String(item.authorString || ''),
        },
        type: 'literature',
      }));
    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'europepmc_preprints',
        searchTime: Date.now(),
        geneSymbol: symbol,
        organism: String(organism || ''),
        attempts: [searchQuery],
        warnings: results.length === 0 ? ['no preprint abstracts matched'] : [],
      },
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return {
      sources: [],
      images: [],
      metadata: {
        totalResults: 0,
        database: 'europepmc_preprints',
        searchTime: Date.now(),
        geneSymbol: symbol,
        error: errorMessage(error),
        warnings: [`Europe PMC preprint search failed: ${errorMessage(error)}`],
      },
    };
  }
}
