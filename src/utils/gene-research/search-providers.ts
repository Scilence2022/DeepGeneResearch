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
  locusTag?: string;
  proteinId?: string;
  /** Exact identity names resolved from authoritative records (for example the reviewed protein name). */
  identityTerms?: string[];
  /** PubMed IDs linked from the exact NCBI Gene record. */
  seedPmids?: string[];
  taxonId?: string | number;
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
  sourceId?: string;
  authoritative?: boolean;
  target?: Record<string, any>;
  geneSymbol?: string;
  organism?: string;
  /** True only when the returned record itself can be tied to the requested target. */
  targetMatch?: boolean;
  provenance?: {
    provider: string;
    recordId?: string;
    matchedBy: string[];
    actualGeneSymbol?: string;
    actualOrganism?: string;
    actualTaxonId?: string | number;
    locusTags?: string[];
    proteinIds?: string[];
  };
  confidence?: number;
  evidence?: string[];
  /** Machine-readable fields copied from an authoritative database record. */
  annotation?: {
    product?: string;
    ecNumbers?: string[];
    goTerms?: string[];
    pathwayTerms?: string[];
    dbXrefs?: string[];
    reviewed?: boolean;
  };
  structuredData?: Record<string, any>;
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
  error?: string;
  attempts?: string[];
  warnings?: string[];
  seedPmidsRequested?: number;
  seedPmidsRetrieved?: number;
  seedRetrievalComplete?: boolean;
  targetMatch?: boolean;
  disabled?: boolean;
}

export interface GeneTargetRelevance {
  accepted: boolean;
  score: number;
  matchedBy: string[];
  reason: string;
  directness: 'direct' | 'gene_linked_context' | 'rejected';
}

async function requireOk(response: Response, provider: string): Promise<Response> {
  if (response.ok) return response;
  const body = (await response.text()).replace(/\s+/g, ' ').slice(0, 300);
  throw new Error(`${provider} returned HTTP ${response.status}${body ? `: ${body}` : ''}`);
}

const NCBI_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
let ncbiRequestQueue: Promise<void> = Promise.resolve();
let lastNcbiRequestAt = 0;

function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason || new Error('NCBI request aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 10_000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.min(Math.max(0, date - Date.now()), 10_000);
}

async function waitForNcbiRequestSlot(apiKey?: string, signal?: AbortSignal): Promise<void> {
  const minimumIntervalMs = apiKey ? 110 : 350;
  const scheduled = ncbiRequestQueue.then(async () => {
    signal?.throwIfAborted();
    const waitMs = Math.max(0, minimumIntervalMs - (Date.now() - lastNcbiRequestAt));
    await abortableDelay(waitMs, signal);
    signal?.throwIfAborted();
    lastNcbiRequestAt = Date.now();
  });
  ncbiRequestQueue = scheduled.catch(() => undefined);
  return scheduled;
}

function withNcbiApiKey(rawUrl: string, apiKey?: string): string {
  if (!apiKey) return rawUrl;
  const url = new URL(rawUrl);
  if (!url.searchParams.has('api_key')) url.searchParams.set('api_key', apiKey);
  return url.toString();
}

async function fetchNcbi(
  rawUrl: string,
  {
    apiKey,
    signal,
    init,
    provider,
    maxAttempts = 3,
  }: {
    apiKey?: string;
    signal?: AbortSignal;
    init?: RequestInit;
    provider: string;
    maxAttempts?: number;
  },
): Promise<Response> {
  const url = withNcbiApiKey(rawUrl, apiKey);
  let lastResponse: Response | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    signal?.throwIfAborted();
    await waitForNcbiRequestSlot(apiKey, signal);
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: createFetchSignal(signal) });
    } catch (error) {
      signal?.throwIfAborted();
      if (attempt === maxAttempts) throw error;
      await abortableDelay(Math.min(2_000, 250 * (2 ** (attempt - 1))), signal);
      continue;
    }
    if (response.ok) return response;
    lastResponse = response;
    if (!NCBI_RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) {
      return requireOk(response, provider);
    }
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    const backoffMs = retryAfterMs ?? Math.min(2_000, 250 * (2 ** (attempt - 1)));
    await abortableDelay(backoffMs, signal);
  }
  return requireOk(lastResponse!, provider);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function emptyProviderResult(
  database: string,
  options: Pick<GeneSearchProviderOptions, 'geneSymbol' | 'organism'>,
  error?: string,
  extra: Partial<GeneSearchMetadata> = {}
): GeneSearchResult {
  return {
    sources: [],
    images: [],
    metadata: {
      totalResults: 0,
      database,
      searchTime: 0,
      geneSymbol: options.geneSymbol,
      organism: options.organism,
      ...(error ? { error } : {}),
      ...extra,
    },
  };
}

function normalizeIdentifier(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function normalizeProteinIdentifier(value: unknown): string {
  return normalizeIdentifier(value).replace(/\.\d+$/, '');
}

function identifiersEqual(left: unknown, right: unknown, stripVersion = false): boolean {
  const normalize = stripVersion ? normalizeProteinIdentifier : normalizeIdentifier;
  return Boolean(normalize(left)) && normalize(left) === normalize(right);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsIdentifier(text: string, identifier?: string): boolean {
  const clean = String(identifier || '').trim();
  if (!clean) return false;
  return new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(clean)}(?=$|[^A-Za-z0-9_])`, 'i').test(text);
}

function organismAliases(organism?: string): string[] {
  const clean = String(organism || '').trim();
  if (!clean) return [];
  const words = clean.split(/\s+/);
  const aliases = [clean];
  if (words.length >= 2) {
    aliases.push(`${words[0][0]}. ${words[1]}`);
    aliases.push(`${words[0][0]} ${words[1]}`);
  }
  return Array.from(new Set(aliases.map(alias => alias.toLowerCase())));
}

function textMentionsOrganism(text: string, organism?: string): boolean {
  const lower = text.toLowerCase();
  return organismAliases(organism).some(alias => lower.includes(alias));
}

function organismNamesCompatible(actual?: string, requested?: string): boolean {
  const actualName = normalizeIdentifier(actual).replace(/\s+/g, ' ');
  const requestedName = normalizeIdentifier(requested).replace(/\s+/g, ' ');
  if (!requestedName) return true;
  return actualName === requestedName
    || actualName.startsWith(`${requestedName} (`)
    || actualName.startsWith(`${requestedName} str.`)
    || actualName.startsWith(`${requestedName} subsp.`);
}

function targetTextMatch(
  text: string,
  options: Pick<GeneSearchProviderOptions, 'geneSymbol' | 'organism' | 'locusTag' | 'proteinId'>
): { targetMatch: boolean; matchedBy: string[]; exactIdentifierMatch: boolean } {
  const matchedBy: string[] = [];
  const proteinMatch = containsIdentifier(text, options.proteinId);
  const locusMatch = containsIdentifier(text, options.locusTag);
  const geneMatch = containsIdentifier(text, options.geneSymbol);
  const organismMatch = textMentionsOrganism(text, options.organism);
  if (proteinMatch) matchedBy.push('protein_id');
  if (locusMatch) matchedBy.push('locus_tag');
  if (geneMatch) matchedBy.push('gene_symbol');
  if (organismMatch) matchedBy.push('organism_text');
  const identifierMatch = proteinMatch || locusMatch || geneMatch;
  return {
    targetMatch: identifierMatch && (!options.organism || organismMatch),
    matchedBy,
    exactIdentifierMatch: proteinMatch || locusMatch,
  };
}

function compactIdentityTerms(
  options: Pick<GeneSearchProviderOptions, 'geneSymbol' | 'locusTag' | 'proteinId' | 'identityTerms'>
): string[] {
  const rawTerms = Array.from(new Set([
    options.proteinId,
    options.locusTag,
    options.geneSymbol,
    ...(options.identityTerms || []),
  ]
    .map(value => String(value || '').trim())
    .filter(value => value.length >= 3)));
  const expanded = rawTerms.flatMap(value => {
    const variants = [value];
    const databaseIdentifier = value.match(/^[A-Za-z][A-Za-z0-9_-]*:(.+)$/);
    if (databaseIdentifier?.[1]) variants.push(databaseIdentifier[1]);
    const trailingNumber = value.match(/^(.*)\s+([123])$/);
    if (trailingNumber) {
      const roman = ({ '1': 'I', '2': 'II', '3': 'III' } as Record<string, string>)[trailingNumber[2]];
      variants.push(`${trailingNumber[1]} ${roman}`);
      variants.push(trailingNumber[1].replace(/^[A-Za-z]+-sensitive\s+/i, '') + ` ${roman}`);
    }
    return variants;
  });
  return Array.from(new Set(expanded)).slice(0, 12);
}

const OFF_TARGET_TITLE_TAXA = [
  'anopheles', 'arabidopsis', 'bacillus', 'brevibacterium', 'burkholderia',
  'corynebacterium', 'drosophila', 'homo sapiens', 'mouse', 'mus musculus',
  'oryza', 'rat', 'rattus', 'saccharomyces', 'staphylococcus', 'streptococcus',
  'synechococcus', 'tobacco', 'zea mays',
];

function sentenceSegments(value: string): string[] {
  return value
    .replace(/\b([A-Z])\.\s*([a-z]{2,})\b/g, '$1 $2')
    .split(/(?<=[.!?])\s+|[\r\n]+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function hasGeneSpecificContext(sentence: string, geneSymbol?: string): boolean {
  if (!containsIdentifier(sentence, geneSymbol)) return false;
  return /\b(?:genes?|locus|operons?|riboswitch(?:es)?|transcripts?|transcription|promoters?|attenuation|express(?:ed|es|ion)?|mutants?|mutagen(?:esis|ized)|knockouts?|overexpress(?:ed|es|ion)?|regulat(?:e|ed|es|ing|ion|ory)|encod(?:e|ed|es|ing)|biosynth(?:esis|etic)|cataly(?:sis|tic|zes?)|enzymes?|proteins?|kinases?|function(?:al)?|characteri[sz](?:e|ed|es|ing|ation))\b/i.test(sentence);
}

function hasReagentCollision(text: string, geneSymbol?: string): boolean {
  const gene = String(geneSymbol || '').trim();
  if (!gene) return false;
  const isLysC = /^lysc$/i.test(gene);
  // Reagent prose commonly spells the protease as Lys-C, Lys C, or lysyl
  // endopeptidase, none of which contains the contiguous `lysC` gene token.
  if (!isLysC && !containsIdentifier(text, gene)) return false;
  const symbol = escapeRegExp(gene);
  const lysCVariant = isLysC ? '(?:lys[-\\s]?c|lysyl\\s+endopeptidase)' : symbol;
  const reagent = '(?:proteases?|endoproteinases?|lysyl\\s+endopeptidase|digest(?:ion|ed|ing)?|cleav(?:age|ed|ing)|proteolysis|sample\\s+processing)';
  return new RegExp(`(?:\\b${lysCVariant}\\b[^.]{0,90}\\b${reagent}\\b|\\b${reagent}\\b[^.]{0,90}\\b${lysCVariant}\\b|\\b${lysCVariant}\\b[^.]{0,40}\\btrypsin\\b|\\btrypsin\\b[^.]{0,40}\\b${lysCVariant}\\b)`, 'i').test(text);
}

function hasHomonymCollision(text: string, geneSymbol?: string): boolean {
  if (!/^lysc$/i.test(String(geneSymbol || ''))) return false;
  return /\blysozyme[-\s]+c(?:-?\d+)?\b|\bLYSC-\d+\b/i.test(text);
}

function hasPhageLysisCollision(text: string, geneSymbol?: string): boolean {
  if (!containsIdentifier(text, geneSymbol)) return false;
  return /\b(?:bacteriophages?|phages?)\b[^.]{0,120}\b(?:lysis|lytic|lysc)\b|\blysis\s+genes?\b/i.test(text);
}

/**
 * Assess whether retrieved prose discusses the requested gene in the requested
 * organism. For short symbols, co-occurrence anywhere in an abstract is not
 * enough: target and organism must share a sentence and the symbol must occur
 * in genuine gene/function context. Exact stable identifiers and NCBI Gene
 * links remain strong identity evidence.
 */
export function assessGeneTargetRelevance(
  title: string,
  abstract: string,
  options: Pick<GeneSearchProviderOptions, 'geneSymbol' | 'organism' | 'locusTag' | 'proteinId' | 'identityTerms'>,
  geneLinked = false,
): GeneTargetRelevance {
  const text = `${title}\n${abstract}`;
  const sentences = sentenceSegments(text);
  const matchedBy: string[] = [];
  let score = 0;

  const proteinMatch = containsIdentifier(text, options.proteinId);
  const locusMatch = containsIdentifier(text, options.locusTag);
  const geneMatch = containsIdentifier(text, options.geneSymbol);
  const organismMatch = textMentionsOrganism(text, options.organism);
  const aliases = compactIdentityTerms(options)
    .map(value => String(value || '').trim())
    .filter(value => value.length >= 4)
    .filter(value => !identifiersEqual(value, options.geneSymbol))
    .filter(value => !identifiersEqual(value, options.locusTag))
    .filter(value => !identifiersEqual(value, options.proteinId, true));
  const aliasMatches = aliases.filter(alias => containsIdentifier(text, alias));
  const strongAliasMatches = aliasMatches.filter(alias => alias.length >= 7 || /\d/.test(alias));
  const targetOrganismSentences = sentences.filter(sentence => textMentionsOrganism(sentence, options.organism));
  const geneAndOrganismSameSentence = targetOrganismSentences.some(sentence =>
    containsIdentifier(sentence, options.geneSymbol) && hasGeneSpecificContext(sentence, options.geneSymbol)
  );
  const aliasAndOrganismSameSentence = targetOrganismSentences.some(sentence =>
    strongAliasMatches.some(alias => containsIdentifier(sentence, alias))
  );
  const titleHasTargetOrganism = textMentionsOrganism(title, options.organism);
  const titleHasGene = containsIdentifier(title, options.geneSymbol);
  const titleHasStableIdentifier = containsIdentifier(title, options.proteinId) || containsIdentifier(title, options.locusTag);
  const titleHasAuthoritativeName = strongAliasMatches.some(alias => containsIdentifier(title, alias));
  const targetGenus = String(options.organism || '').trim().split(/\s+/)[0].toLowerCase();
  const titleLower = title.toLowerCase();
  const foreignTaxonInTitle = OFF_TARGET_TITLE_TAXA.some(taxon =>
    taxon !== targetGenus
    && new RegExp(`(^|[^a-z])${escapeRegExp(taxon).replace(/\\ /g, '\\s+')}(?=$|[^a-z])`, 'i').test(titleLower)
  );
  const exactStableIdentifier = proteinMatch || locusMatch;
  // A Gene-PubMed link is strong provenance, but it must not override an
  // explicit title/abstract collision. This prevents an accidental or broad
  // link from laundering LysC protease, lysozyme C, phage lysC, or a clearly
  // off-taxon paper into the target bibliography. An exact stable identifier
  // can still disambiguate the record.
  const reagentCollision = !exactStableIdentifier && hasReagentCollision(text, options.geneSymbol);
  const homonymCollision = !exactStableIdentifier && hasHomonymCollision(text, options.geneSymbol);
  const phageCollision = !exactStableIdentifier && hasPhageLysisCollision(text, options.geneSymbol);
  const foreignTitleWithoutTarget = foreignTaxonInTitle && !titleHasTargetOrganism;
  const offOrganismCollision = !geneLinked && foreignTitleWithoutTarget;

  if (proteinMatch) { score += 10; matchedBy.push('protein_id'); }
  if (locusMatch) { score += 10; matchedBy.push('locus_tag'); }
  if (geneMatch) { score += 5; matchedBy.push('gene_symbol'); }
  if (aliasMatches.length > 0) { score += 6; matchedBy.push('authoritative_name'); }
  if (organismMatch) { score += 5; matchedBy.push('organism_text'); }
  if (geneLinked) { score += 8; matchedBy.push('ncbi_gene_pubmed_link'); }
  if (geneAndOrganismSameSentence) { score += 4; matchedBy.push('target_organism_same_sentence'); }
  if (aliasAndOrganismSameSentence) { score += 4; matchedBy.push('authoritative_name_same_sentence'); }
  if (containsIdentifier(title, options.geneSymbol) || aliasMatches.some(alias => containsIdentifier(title, alias))) {
    score += 2;
    matchedBy.push('title_identity');
  }
  if (/\b(mutant|knockout|enzyme|kinetic|catalytic|structure|regulat|operon|riboswitch|biosynth|pathway)\w*\b/i.test(text)) {
    score += 1;
    matchedBy.push('gene_context');
  }

  // Free-text discovery must be about the target, not merely mention it in an
  // abstract about another gene, organism, or engineering system. Require the
  // exact gene/product identity in the title plus organism support. Exact
  // stable identifiers remain sufficient. NCBI Gene-linked records without
  // this focus are retained separately as contextual bibliography.
  const titleFocusedTarget = titleHasGene || titleHasAuthoritativeName || titleHasStableIdentifier;
  const namedTargetWithOrganism = !foreignTitleWithoutTarget && titleFocusedTarget && organismMatch;
  const collision = reagentCollision || homonymCollision || phageCollision || offOrganismCollision;
  const directSupport = exactStableIdentifier || namedTargetWithOrganism;
  const accepted = !collision && (directSupport || geneLinked);
  let reason: string;
  if (accepted) reason = `target supported by ${matchedBy.join(', ')}`;
  else if (reagentCollision) reason = 'rejected: gene-like token denotes a laboratory protease or digestion reagent';
  else if (homonymCollision) reason = 'rejected: gene-like token denotes lysozyme C rather than the requested gene';
  else if (phageCollision) reason = 'rejected: gene-like token belongs to a bacteriophage lysis cassette';
  else if (offOrganismCollision) reason = 'rejected: title identifies a different source organism';
  else if (!geneLinked && (geneMatch || aliasMatches.length > 0) && !titleFocusedTarget) {
    reason = 'rejected: target is mentioned only in a paper focused on another subject';
  } else {
    reason = `rejected: ${geneMatch || aliasMatches.length > 0 ? 'target and requested organism lack direct sentence-level support' : 'no exact target identity'}`;
  }
  return {
    accepted,
    score,
    matchedBy,
    reason,
    directness: accepted ? (directSupport ? 'direct' : 'gene_linked_context') : 'rejected',
  };
}

/** Resolve literature linked by NCBI to an exact GeneID before free-text discovery. */
export async function fetchPubMedIdsForGene(
  geneId: string,
  options: { apiKey?: string; signal?: AbortSignal; maxResult?: number } = {},
): Promise<string[]> {
  const cleanGeneId = String(geneId || '').trim();
  if (!/^\d+$/.test(cleanGeneId)) return [];
  const limit = Math.min(options.maxResult || 100, 200);
  const params = new URLSearchParams({
    dbfrom: 'gene',
    db: 'pubmed',
    id: cleanGeneId,
    retmode: 'xml',
  });
  try {
    const response = await fetchNcbi(
      `${GENE_DATABASE_URLS.NCBI_EUTILS}elink.fcgi?${params.toString()}`,
      { apiKey: options.apiKey, signal: options.signal, provider: 'NCBI Gene-PubMed elink' },
    );
    // NCBI occasionally emits literal control characters in JSON ELink
    // responses. XML lets us extract the numeric links without parsing those
    // unrelated text nodes, so one malformed field cannot erase a bibliography.
    const xml = await response.text();
    const ids = splitXmlBlocks(xml, 'LinkSetDb')
      .filter(linkSet => extractTag(linkSet, 'DbTo').toLowerCase() === 'pubmed')
      .flatMap(linkSet => splitXmlBlocks(linkSet, 'Link').map(link => extractTag(link, 'Id')))
      .filter(id => /^\d+$/.test(id));
    if (ids.length > 0) return Array.from(new Set(ids)).slice(0, limit);
  } catch (error) {
    if (options.signal?.aborted) throw error;
  }

  // ELink has occasionally returned a successful HTTP status with only the
  // XML declaration (or reset the stream mid-response). The exact Gene
  // record carries the same curated PubMed references, so use it as a
  // deterministic fallback instead of presenting an empty bibliography.
  const geneParams = new URLSearchParams({
    db: 'gene',
    id: cleanGeneId,
    retmode: 'xml',
  });
  const geneResponse = await fetchNcbi(
    `${GENE_DATABASE_URLS.NCBI_EUTILS}efetch.fcgi?${geneParams.toString()}`,
    { apiKey: options.apiKey, signal: options.signal, provider: 'NCBI Gene record PubMed fallback' },
  );
  const geneXml = await geneResponse.text();
  const fallbackIds = extractAllTags(geneXml, 'PubMedId').filter(id => /^\d+$/.test(id));
  return Array.from(new Set(fallbackIds)).slice(0, limit);
}

/**
 * Resolve an exact NCBI protein accession to the GeneID records linked by
 * Entrez. The accession is first resolved in the protein database because
 * ELink expects Entrez UIDs, not an arbitrary gene-symbol search result.
 */
export async function fetchGeneIdsForProteinAccession(
  proteinAccession: string,
  options: { apiKey?: string; signal?: AbortSignal; maxResult?: number } = {},
): Promise<string[]> {
  const accession = String(proteinAccession || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(accession)) return [];
  const limit = Math.min(Math.max(options.maxResult || 20, 1), 100);
  const searchParams = new URLSearchParams({
    db: 'protein',
    term: `"${accession}"[Accession]`,
    retmax: String(limit),
    retmode: 'json',
  });
  const searchResponse = await fetchNcbi(
    `${GENE_DATABASE_URLS.NCBI_EUTILS}esearch.fcgi?${searchParams.toString()}`,
    { apiKey: options.apiKey, signal: options.signal, provider: 'NCBI Protein accession esearch' },
  );
  const searchData = await searchResponse.json();
  const proteinUids = Array.from(new Set(
    (searchData.esearchresult?.idlist || []).map(String).filter((id: string) => /^\d+$/.test(id)),
  )).slice(0, limit) as string[];
  if (proteinUids.length === 0) return [];

  const linkParams = new URLSearchParams({
    dbfrom: 'protein',
    db: 'gene',
    retmode: 'json',
  });
  for (const proteinUid of proteinUids) linkParams.append('id', proteinUid);
  const linkResponse = await fetchNcbi(
    `${GENE_DATABASE_URLS.NCBI_EUTILS}elink.fcgi?${linkParams.toString()}`,
    { apiKey: options.apiKey, signal: options.signal, provider: 'NCBI Protein-Gene elink' },
  );
  const linkData = await linkResponse.json();
  const geneIds = (linkData.linksets || [])
    .flatMap((linkset: any) => linkset.linksetdbs || [])
    .filter((linkset: any) => linkset.dbto === 'gene')
    .flatMap((linkset: any) => linkset.links || [])
    .map(String)
    .filter((id: string) => /^\d+$/.test(id));
  return Array.from(new Set(geneIds)).slice(0, limit) as string[];
}

// PubMed search provider for literature
export async function searchPubMed({
  query,
  geneSymbol,
  organism,
  locusTag,
  proteinId,
  identityTerms,
  seedPmids = [],
  maxResult = 20,
  apiKey,
  scope,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = { "Content-Type": "application/json" };

  try {
    // PubMed does not have reliable Gene Name / Organism fields for all
    // articles. The previous query also appended an entire natural-language
    // prompt with AND semantics, which routinely forced valid genes to zero
    // results. Search narrowly first, then broaden while retaining both gene
    // and organism identity terms.
    const topicVocabulary = [
      'function', 'catalytic', 'enzyme', 'substrate', 'structure', 'domain',
      'pathway', 'biosynthesis', 'regulation', 'expression', 'localization',
      'interaction', 'ortholog', 'conservation', 'biochemical', 'mechanism',
    ];
    const topicTerms = topicVocabulary.filter(term => query.toLowerCase().includes(term)).slice(0, 4);
    const topicClause = topicTerms.length
      ? ` AND (${topicTerms.map(term => `"${term}"[Title/Abstract]`).join(' OR ')})`
      : '';
    const organismTitleAbstractClause = organismAliases(organism)
      .map(alias => `"${alias}"[Title/Abstract]`)
      .join(' OR ');
    const identities = compactIdentityTerms({ geneSymbol, locusTag, proteinId, identityTerms });
    const identityClause = identities.map(identifier => `"${identifier.replace(/"/g, '')}"[Title/Abstract]`).join(' OR ');
    const exactIdentifiers = Array.from(new Set([proteinId, locusTag].filter(Boolean) as string[]));
    const exactIdentityQuery = exactIdentifiers.length
      ? exactIdentifiers.map(identifier => `"${identifier}"[Title/Abstract]`).join(' OR ')
      : null;
    const broadTargetQuery = identityClause && organismTitleAbstractClause
      ? `(${identityClause}) AND (${organismTitleAbstractClause})`
      : null;
    const searchQueries = scope === 'seed_only'
      ? []
      : (geneSymbol && organism
          ? [
              broadTargetQuery ? `${broadTargetQuery}${topicClause}` : null,
              broadTargetQuery,
              exactIdentityQuery ? `(${exactIdentityQuery})` : null,
            ].filter((searchQuery, index, values): searchQuery is string => Boolean(searchQuery) && values.indexOf(searchQuery) === index)
          : [query]);
    const exactSeedPmids = Array.from(new Set(seedPmids.map(String))).slice(0, 100);
    const discoveryPmidSet = new Set<string>();
    const attempts: string[] = [];
    const warnings: string[] = [];
    const requestedPoolSize = Math.min(Math.max(maxResult * 4, 20), 100);
    for (const searchQuery of searchQueries) {
      attempts.push(searchQuery);
      const queryParams = new URLSearchParams({
        db: 'pubmed',
        term: searchQuery,
        retmax: String(requestedPoolSize),
        retmode: 'json',
      });
      try {
        const searchResponse = await fetchNcbi(
          `${GENE_DATABASE_URLS.NCBI_EUTILS}esearch.fcgi?${queryParams.toString()}`,
          { apiKey, signal, init: { headers }, provider: 'PubMed esearch' },
        );
        const searchData = await searchResponse.json();
        for (const pmid of searchData.esearchresult?.idlist || []) discoveryPmidSet.add(String(pmid));
      } catch (error) {
        signal?.throwIfAborted();
        warnings.push(`${searchQuery}: ${errorMessage(error)}`);
      }
    }
    const discoveryPmids = Array.from(discoveryPmidSet)
      .filter(pmid => !exactSeedPmids.includes(pmid))
      .slice(0, 100);

    if (exactSeedPmids.length === 0 && discoveryPmids.length === 0) {
      return {
        sources: [],
        images: [],
        metadata: {
          totalResults: 0,
          database: 'pubmed',
          searchTime: 0,
          attempts,
          warnings,
          ...(warnings.length ? { error: warnings.join('; ') } : {}),
          seedPmidsRequested: exactSeedPmids.length,
          seedPmidsRetrieved: 0,
          seedRetrievalComplete: exactSeedPmids.length === 0,
        },
      };
    }

    // Retrieve exact Gene-linked records separately from discovery results.
    // A broad discovery chunk can be large or fail independently; it must
    // never suppress the exact bibliography resolved from the target GeneID.
    const parsedSources: GeneSource[] = [];
    const fetchDetailedRecords = async (pmids: string[], chunkSize: number, label: string) => {
      for (let offset = 0; offset < pmids.length; offset += chunkSize) {
        const chunk = pmids.slice(offset, offset + chunkSize);
        try {
          const detailParams = new URLSearchParams({
            db: 'pubmed',
            id: chunk.join(','),
            retmode: 'xml',
            rettype: 'abstract',
          });
          const detailResponse = await fetchNcbi(
            `${GENE_DATABASE_URLS.NCBI_EUTILS}efetch.fcgi?${detailParams.toString()}`,
            { apiKey, signal, init: { headers }, provider: 'PubMed efetch' },
          );
          const xmlData = await detailResponse.text();
          parsedSources.push(...parsePubMedResults(xmlData, {
            geneSymbol,
            organism,
            locusTag,
            proteinId,
            identityTerms,
            seedPmids: exactSeedPmids,
          }));
        } catch (error) {
          signal?.throwIfAborted();
          warnings.push(`${label} PMID chunk ${chunk[0]}-${chunk[chunk.length - 1]}: ${errorMessage(error)}`);
        }
      }
    };
    await fetchDetailedRecords(exactSeedPmids, 20, 'Gene-linked');
    await fetchDetailedRecords(discoveryPmids, 50, 'Discovery');

    const retrievedPmids = new Set(parsedSources.map(source => String(source.provenance?.recordId || '')).filter(Boolean));
    const seedPmidsRetrieved = exactSeedPmids.filter(pmid => retrievedPmids.has(pmid)).length;
    const seedRetrievalComplete = seedPmidsRetrieved === exactSeedPmids.length;
    const resultLimit = Math.min(maxResult + exactSeedPmids.length, 200);
    const acceptedByPmid = new Map<string, GeneSource>();
    for (const source of parsedSources) {
      if (source.structuredData?.targetRelevance?.accepted !== true) continue;
      const key = String(source.provenance?.recordId || source.url);
      const existing = acceptedByPmid.get(key);
      if (!existing || Number(source.structuredData?.targetRelevance?.score || 0) > Number(existing.structuredData?.targetRelevance?.score || 0)) {
        acceptedByPmid.set(key, source);
      }
    }
    const sources = Array.from(acceptedByPmid.values())
      .filter(source => source.structuredData?.targetRelevance?.accepted === true)
      .sort((left, right) => {
        const leftLinked = left.structuredData?.targetRelevance?.matchedBy?.includes('ncbi_gene_pubmed_link') ? 1 : 0;
        const rightLinked = right.structuredData?.targetRelevance?.matchedBy?.includes('ncbi_gene_pubmed_link') ? 1 : 0;
        return rightLinked - leftLinked
          || Number(right.structuredData?.targetRelevance?.score || 0) - Number(left.structuredData?.targetRelevance?.score || 0);
      })
      .slice(0, resultLimit);

    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'pubmed',
        searchTime: Date.now(),
        geneSymbol,
        organism,
        qualityScore: calculateQualityScore(sources),
        attempts,
        warnings,
        seedPmidsRequested: exactSeedPmids.length,
        seedPmidsRetrieved,
        seedRetrievalComplete,
        ...(sources.length === 0 && warnings.length ? { error: warnings.join('; ') } : {}),
        targetMatch: sources.length > 0,
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    console.error('PubMed search error:', error);
    return emptyProviderResult('pubmed', { geneSymbol, organism }, errorMessage(error));
  }
}

// UniProt search provider for protein information
export async function searchUniProt({
  query,
  geneSymbol,
  organism,
  locusTag,
  proteinId,
  taxonId,
  maxResult = 10,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const exactProteinId = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,79}$/.test(String(proteinId || '').trim())
      ? String(proteinId).trim()
      : '';
    const entryMatchesProteinIdentifier = (entry: any) => {
      if (!proteinId) return false;
      const identifiers = [
        entry.primaryAccession,
        entry.uniProtkbId,
        ...(entry.uniProtKBCrossReferences || [])
          .filter((reference: any) => ['RefSeq', 'EMBL', 'AlphaFoldDB'].includes(reference.database))
          .map((reference: any) => reference.id),
      ];
      return identifiers.some(identifier => identifiersEqual(identifier, proteinId, true));
    };
    const exactProteinQueries = exactProteinId
      ? [
          `accession:${exactProteinId}`,
          `xref:RefSeq-${exactProteinId}`,
          `xref:EMBL-${exactProteinId}`,
        ]
      : [];
    const geneQueries = geneSymbol && organism
      ? [
          taxonId ? `gene_exact:${geneSymbol} AND organism_id:${taxonId}` : null,
          `gene_exact:${geneSymbol} AND organism_name:"${organism}"`,
        ].filter((value): value is string => Boolean(value))
      : [query];
    // CodeXomics may use the stable protein accession as its provisional
    // top-level symbol. Resolve immutable accession/xref fields before ever
    // relying on that value as a UniProt gene name.
    const searchQueries = Array.from(new Set([...exactProteinQueries, ...geneQueries]));
    const resultsByAccession = new Map<string, any>();
    const attempts: string[] = [];
    const warnings: string[] = [];
    for (const searchQuery of searchQueries) {
      attempts.push(searchQuery);
      try {
        const response = await requireOk(await fetch(
          `${GENE_DATABASE_URLS.UNIPROT_API}uniprotkb/search?query=${encodeURIComponent(searchQuery)}&format=json&size=${maxResult}`,
          { headers, signal: createFetchSignal(signal) }
        ), 'UniProt search');
        const data = await response.json();
        for (const entry of data.results || []) {
          resultsByAccession.set(String(entry.primaryAccession || entry.uniProtkbId), entry);
        }
        if (proteinId && Array.from(resultsByAccession.values()).some(entryMatchesProteinIdentifier)) break;
        // Without an immutable protein/locus identifier, the exact-taxonomy
        // result is authoritative and a broader organism-name union is not
        // needed. Stable targets query both because NCBI assembly TaxIDs and
        // UniProt strain TaxIDs legitimately differ (for example 511145 vs
        // 83333 for E. coli K-12 MG1655).
        if (!proteinId && !locusTag && resultsByAccession.size > 0) break;
      } catch (error) {
        signal?.throwIfAborted();
        warnings.push(`${searchQuery}: ${errorMessage(error)}`);
      }
    }
    const rankedResults = Array.from(resultsByAccession.values()).sort((left: any, right: any) => {
      const score = (entry: any) => {
        const locusNames = (entry.genes || []).flatMap((gene: any) => gene.orderedLocusNames || []).map((item: any) => item.value);
        return (locusTag && locusNames.includes(locusTag) ? 4 : 0)
          + (entryMatchesProteinIdentifier(entry) ? 4 : 0)
          + (entry.entryType === 'UniProtKB reviewed (Swiss-Prot)' ? 2 : 0)
          + (entry.genes?.some((gene: any) => gene.geneName?.value?.toLowerCase() === geneSymbol?.toLowerCase()) ? 1 : 0);
      };
      return score(right) - score(left);
    });
    const exactLocusResults = locusTag
      ? rankedResults.filter((entry: any) => (entry.genes || [])
          .flatMap((gene: any) => gene.orderedLocusNames || [])
          .some((item: any) => item.value === locusTag))
      : [];
    const exactProteinResults = proteinId
      ? rankedResults.filter(entryMatchesProteinIdentifier)
      : [];
    const exactTargetResults = [...exactProteinResults, ...exactLocusResults]
      .filter((entry: any, index: number, entries: any[]) => entries.indexOf(entry) === index);
    // An immutable annotation target must fail closed. Never turn a missing exact
    // locus/accession match into an unrelated strain-wide gene-symbol hit.
    const selectedResults = proteinId || locusTag
      ? exactTargetResults.slice(0, 1)
      : rankedResults;
    const sources = parseUniProtResults(selectedResults, geneSymbol, organism, locusTag, proteinId, taxonId);

    return {
      sources,
      images: [],
      metadata: {
        totalResults: sources.length,
        database: 'uniprot',
        searchTime: Date.now(),
        geneSymbol,
        organism,
        qualityScore: calculateQualityScore(sources),
        attempts,
        warnings,
        ...(sources.length === 0 && warnings.length ? { error: warnings.join('; ') } : {}),
      }
    };
  } catch (error) {
    signal?.throwIfAborted();
    console.error('UniProt search error:', error);
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'uniprot', searchTime: 0, error: error instanceof Error ? error.message : String(error) } };
  }
}

// NCBI Gene search provider
export async function searchNCBIGene({
  query,
  geneSymbol,
  organism,
  locusTag,
  proteinId,
  maxResult = 10,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  try {
    let geneIds: string[];
    let proteinLinkedGeneIds = new Set<string>();
    if (proteinId && !locusTag) {
      geneIds = await fetchGeneIdsForProteinAccession(proteinId, {
        apiKey,
        signal,
        maxResult,
      });
      proteinLinkedGeneIds = new Set(geneIds);
    } else {
      const searchQuery = geneSymbol && organism
        ? `${locusTag || geneSymbol}[${locusTag ? 'Locus Tag' : 'Gene Name'}] AND ${organism}[Organism]`
        : query;
      const response = await fetchNcbi(
        `${GENE_DATABASE_URLS.NCBI_EUTILS}esearch.fcgi?db=gene&term=${encodeURIComponent(searchQuery)}&retmax=${maxResult}&retmode=json`,
        { apiKey, signal, init: { headers }, provider: 'NCBI Gene esearch' },
      );
      const data = await response.json();
      geneIds = (data.esearchresult?.idlist || []).map(String);
    }

    if (geneIds.length === 0) {
      return { sources: [], images: [], metadata: { totalResults: 0, database: 'ncbi_gene', searchTime: 0 } };
    }

    // Fetch detailed gene information
    const detailResponse = await fetchNcbi(
      `${GENE_DATABASE_URLS.NCBI_EUTILS}efetch.fcgi?db=gene&id=${geneIds.join(',')}&retmode=xml`,
      { apiKey, signal, init: { headers }, provider: 'NCBI Gene efetch' },
    );
    const xmlData = await detailResponse.text();

    const parsedSources = parseNCBIGeneResults(
      xmlData,
      geneSymbol,
      organism,
      locusTag,
      proteinId,
      proteinLinkedGeneIds,
    );
    const sources = locusTag || proteinId
      ? parsedSources.filter(source => source.targetMatch === true)
      : parsedSources;

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
    return { sources: [], images: [], metadata: { totalResults: 0, database: 'ncbi_gene', searchTime: 0, error: error instanceof Error ? error.message : String(error) } };
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

  try {
    const searchQuery = geneSymbol && organism 
      ? `${geneSymbol}[Gene Symbol] AND ${organism}[Organism] AND ${query}`
      : query;

    const response = await fetchNcbi(
      `${GENE_DATABASE_URLS.GEO_API}esearch.fcgi?db=gds&term=${encodeURIComponent(searchQuery)}&retmax=${maxResult}&retmode=json`,
      { apiKey, signal, init: { headers }, provider: 'GEO esearch' },
    );

    const data = await response.json();
    const gdsIds = data.esearchresult?.idlist || [];

    if (gdsIds.length === 0) {
      return { sources: [], images: [], metadata: { totalResults: 0, database: 'geo', searchTime: 0 } };
    }

    // Fetch detailed GEO information
    const detailResponse = await fetchNcbi(
      `${GENE_DATABASE_URLS.GEO_API}efetch.fcgi?db=gds&id=${gdsIds.join(',')}&retmode=xml`,
      { apiKey, signal, init: { headers }, provider: 'GEO efetch' },
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
  locusTag,
  apiKey,
  signal,
}: GeneSearchProviderOptions): Promise<GeneSearchResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const organismCodes: Record<string, string> = {
      'Escherichia coli': 'eco',
      'Corynebacterium glutamicum': 'cgl',
      'Bacillus subtilis': 'bsu',
      'Saccharomyces cerevisiae': 'sce',
      'Homo sapiens': 'hsa',
      'Mus musculus': 'mmu',
    };
    const organismCode = organism ? organismCodes[organism] : undefined;
    const exactEntry = organismCode && locusTag ? `${organismCode}:${locusTag}` : null;
    const searchQuery = geneSymbol ? `${geneSymbol} ${organism || ''}`.trim() : query;

    const response = await requireOk(await fetch(
      exactEntry
        ? `${GENE_DATABASE_URLS.KEGG_API}list/${encodeURIComponent(exactEntry)}`
        : `${GENE_DATABASE_URLS.KEGG_API}find/genes/${encodeURIComponent(searchQuery)}`,
      { headers, signal: createFetchSignal(signal) }
    ), 'KEGG search');

    const data = await response.text();
    const sources = parseKEGGResults(data, geneSymbol, organism, locusTag, organismCode);

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
  locusTag,
  proteinId,
  identityTerms,
  seedPmids,
  taxonId,
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
    locusTag,
    proteinId,
    identityTerms,
    seedPmids,
    taxonId,
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
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (entity, hexadecimal: string | undefined, decimal: string | undefined) => {
      const codePoint = Number.parseInt(hexadecimal || decimal || '', hexadecimal ? 16 : 10);
      // Match XML 1.0's legal character ranges before calling
      // String.fromCodePoint. Invalid, surrogate, and out-of-range entities
      // are retained verbatim instead of throwing or corrupting provenance.
      const isValidXmlCodePoint = codePoint === 0x9
        || codePoint === 0xa
        || codePoint === 0xd
        || (codePoint >= 0x20 && codePoint <= 0xd7ff)
        || (codePoint >= 0xe000 && codePoint <= 0xfffd)
        || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
      return Number.isSafeInteger(codePoint) && isValidXmlCodePoint
        ? String.fromCodePoint(codePoint)
        : entity;
    })
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

function extractPublicationYear(articleXml: string): number {
  const journalIssue = splitXmlBlocks(articleXml, 'JournalIssue')[0] || '';
  const publicationDate = splitXmlBlocks(journalIssue, 'PubDate')[0] || '';
  const journalDate = extractTag(publicationDate, 'Year') || extractTag(publicationDate, 'MedlineDate');
  const articleDate = splitXmlBlocks(articleXml, 'ArticleDate')
    .map(date => extractTag(date, 'Year') || extractTag(date, 'MedlineDate'))
    .find(Boolean) || '';
  const yearText = journalDate || articleDate;
  return Number(yearText.match(/\b(?:18|19|20)\d{2}\b/)?.[0] || 0);
}

function extractPubMedDoi(pubmedDataXml: string, articleXml: string): string {
  // PubmedData's direct ArticleIdList belongs to the current record. Scoping
  // here prevents a DOI from a nested ReferenceList being attributed to it.
  const recordLevelPubmedData = pubmedDataXml.replace(
    /<ReferenceList(?:\s[^>]*)?>[\s\S]*?<\/ReferenceList>/gi,
    '',
  );
  const articleIdList = splitXmlBlocks(recordLevelPubmedData, 'ArticleIdList')[0] || '';
  const articleIdDoi = Array.from(articleIdList.matchAll(
    /<ArticleId\b[^>]*\bIdType=["']doi["'][^>]*>([\s\S]*?)<\/ArticleId>/gi,
  ))[0]?.[1];
  if (articleIdDoi) return stripXmlTags(articleIdDoi);

  // Some PubMed records expose the DOI only as an Article-level ELocationID.
  const electronicDoi = Array.from(articleXml.matchAll(
    /<ELocationID\b[^>]*\bEIdType=["']doi["'][^>]*>([\s\S]*?)<\/ELocationID>/gi,
  ))[0]?.[1];
  return electronicDoi ? stripXmlTags(electronicDoi) : '';
}

function parsePubMedResults(
  xmlData: string,
  options: Pick<GeneSearchProviderOptions, 'geneSymbol' | 'organism' | 'locusTag' | 'proteinId' | 'identityTerms' | 'seedPmids'>
): GeneSource[] {
  const { geneSymbol, organism, locusTag, proteinId } = options;
  return splitXmlBlocks(xmlData, 'PubmedArticle').map((pubmedArticle) => {
    const medlineCitation = splitXmlBlocks(pubmedArticle, 'MedlineCitation')[0] || pubmedArticle;
    const article = splitXmlBlocks(medlineCitation, 'Article')[0] || medlineCitation;
    const pubmedData = splitXmlBlocks(pubmedArticle, 'PubmedData')[0] || '';
    const pmid = extractTag(medlineCitation, 'PMID');
    const title = extractTag(article, 'ArticleTitle') || `PubMed article ${pmid || 'unknown'}`;
    const abstract = extractAllTags(article, 'AbstractText').join(' ');
    const journalXml = splitXmlBlocks(article, 'Journal')[0] || '';
    const journal = extractTag(journalXml, 'ISOAbbreviation') || extractTag(journalXml, 'Title');
    const year = extractPublicationYear(article);
    const publicationTypes = extractAllTags(article, 'PublicationType');
    const doi = extractPubMedDoi(pubmedData, article);
    const authorList = splitXmlBlocks(article, 'AuthorList')[0] || '';
    const authors = splitXmlBlocks(authorList, 'Author')
      .map((author) => [extractTag(author, 'ForeName'), extractTag(author, 'LastName')].filter(Boolean).join(' '))
      .filter(Boolean)
      .slice(0, 6);

    const geneLinked = Boolean(pmid && options.seedPmids?.includes(pmid));
    const relevance = assessGeneTargetRelevance(title, abstract, options, geneLinked);
    const publicationTypeText = publicationTypes.join(' ').toLowerCase();
    const studyType = /meta-analysis/.test(publicationTypeText)
      ? 'meta_analysis'
      : /review/.test(publicationTypeText)
        ? 'review'
        : /computational|in silico|bioinformatics/i.test(`${publicationTypeText} ${abstract}`)
          ? 'computational'
          : /assay|mutant|kinetic|crystal|experiment|purif|measur|culture|strain/i.test(abstract)
            ? 'experimental'
            : 'other';
    return {
      title,
      content: [
        pmid ? `PMID: ${pmid}` : '',
        doi ? `DOI: ${doi}` : '',
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
      targetMatch: relevance.accepted,
      provenance: {
        provider: 'pubmed',
        recordId: pmid,
        matchedBy: relevance.matchedBy,
      },
      structuredData: {
        targetRelevance: relevance,
        literatureReferences: [{
          pmid,
          doi: doi || undefined,
          title,
          authors,
          journal,
          // Unknown publication dates remain unknown (0) rather than being
          // silently rewritten to the current year.
          year,
          abstract,
          relevance: relevance.score >= 11 ? 'high' : 'medium',
          studyType,
          organism: relevance.matchedBy.includes('organism_text') || geneLinked ? organism || '' : '',
          methodology: ['PubMed', ...publicationTypes, relevance.reason],
        }],
      },
      type: 'literature' as const
    };
  });
}

function parseUniProtResults(
  results: any[],
  geneSymbol?: string,
  organism?: string,
  locusTag?: string,
  proteinId?: string,
  taxonId?: string | number,
): GeneSource[] {
  return results.map(result => {
    const accession = result.primaryAccession || result.uniProtkbId;
    const proteinName = result.proteinDescription?.recommendedName?.fullName?.value
      || result.proteinDescription?.submissionNames?.[0]?.fullName?.value
      || result.uniProtkbId;
    const gene = result.genes?.[0]?.geneName?.value || geneSymbol || 'Unknown';
    const actualOrganism = result.organism?.scientificName || '';
    const locusNames = (result.genes || [])
      .flatMap((entry: any) => entry.orderedLocusNames || [])
      .map((entry: any) => entry.value)
      .filter(Boolean);
    const crossReferences = result.uniProtKBCrossReferences || [];
    const proteinIdentifiers = [
      accession,
      result.uniProtkbId,
      ...crossReferences
        .filter((reference: any) => ['RefSeq', 'EMBL', 'AlphaFoldDB'].includes(reference.database))
        .map((reference: any) => reference.id),
    ];
    const exactProteinMatch = Boolean(proteinId && proteinIdentifiers.some(identifier =>
      identifiersEqual(identifier, proteinId, true)
    ));
    const exactLocusMatch = Boolean(locusTag && locusNames.includes(locusTag));
    const exactTaxonMatch = !taxonId || Number(result.organism?.taxonId) === Number(taxonId);
    const taxonBoundByStableIdentifier = !exactTaxonMatch && (exactProteinMatch || exactLocusMatch);
    const compatibleTaxon = exactTaxonMatch || taxonBoundByStableIdentifier;
    const targetMatch = (exactProteinMatch || exactLocusMatch || (!proteinId && !locusTag && gene.toLowerCase() === String(geneSymbol || '').toLowerCase()))
      && organismNamesCompatible(actualOrganism, organism)
      && compatibleTaxon;
    const aliases = [
      ...(result.genes?.[0]?.synonyms || []).map((entry: any) => entry.value),
      ...(result.genes?.[0]?.orderedLocusNames || []).map((entry: any) => entry.value),
    ].filter(Boolean);
    const comments = result.comments || [];
    const commentTexts = (type: string) => comments
      .filter((comment: any) => comment.commentType === type)
      .flatMap((comment: any) => comment.texts || comment.text || [])
      .map((text: any) => text.value)
      .filter(Boolean);
    const functions = commentTexts('FUNCTION');
    const pathways = commentTexts('PATHWAY');
    const families = commentTexts('SIMILARITY');
    const catalyticActivities = comments
      .filter((comment: any) => comment.commentType === 'CATALYTIC ACTIVITY')
      .map((comment: any) => comment.reaction?.name)
      .filter(Boolean);
    const locations = comments
      .filter((comment: any) => comment.commentType === 'SUBCELLULAR LOCATION')
      .flatMap((comment: any) => comment.subcellularLocations || [])
      .map((location: any) => location.location?.value)
      .filter(Boolean);
    const ecNumbers = Array.from(new Set([
      ...(result.proteinDescription?.recommendedName?.ecNumbers || []).map((entry: any) => entry.value),
      ...comments.map((comment: any) => comment.reaction?.ecNumber).filter(Boolean),
    ])) as string[];
    const geneId = crossReferences.find((reference: any) => reference.database === 'GeneID')?.id;
    const goTerms = crossReferences.filter((ref: any) => ref.database === 'GO').map((ref: any) => ref.id);
    const allPathwayTerms = crossReferences
      .filter((ref: any) => ['KEGG', 'BioCyc', 'Reactome'].includes(ref.database))
      .map((ref: any) => `${ref.database}:${ref.id}`);
    const exactKeggTerms = locusTag
      ? allPathwayTerms.filter((term: string) => term.toLowerCase().endsWith(`:${locusTag.toLowerCase()}`))
      : [];
    const pathwayTerms = [
      ...(exactKeggTerms.length ? exactKeggTerms : allPathwayTerms.filter((term: string) => term.startsWith('KEGG:'))),
      ...allPathwayTerms.filter((term: string) => !term.startsWith('KEGG:')),
    ];
    const dbXrefs = [
      `UniProtKB:${accession}`,
      ...crossReferences.filter((ref: any) => ['GeneID', 'RefSeq', 'PDB'].includes(ref.database))
        .map((ref: any) => `${ref.database}:${ref.id}`),
    ];
    const pmids = Array.from(new Set(
      comments.flatMap((comment: any) => [
        ...(comment.texts || []).flatMap((text: any) => text.evidences || []),
        ...(comment.reaction?.evidences || []),
      ]).filter((evidence: any) => evidence.source === 'PubMed').map((evidence: any) => evidence.id)
    )) as string[];
    const content = [
      `UniProtKB: ${accession}`,
      `Protein: ${proteinName}`,
      `Gene: ${gene}`,
      aliases.length ? `Alternative names: ${aliases.join(', ')}` : '',
      `Organism: ${result.organism?.scientificName || organism || 'Unknown'}`,
      functions.length ? `Function: ${functions.join(' ')}` : '',
      catalyticActivities.length ? `Catalytic activity: ${catalyticActivities.join('; ')}` : '',
      ecNumbers.length ? `EC: ${ecNumbers.join(', ')}` : '',
      pathways.length ? `Biological process: ${pathways.join('; ')}` : '',
      locations.length ? `Subcellular location: ${locations.join(', ')}` : '',
      families.length ? `Protein family: ${families.join(' ')}` : '',
      result.sequence?.length ? `Protein length: ${result.sequence.length} aa` : '',
      result.sequence?.molWeight ? `Molecular weight: ${result.sequence.molWeight} Da` : '',
      goTerms.length ? `GO terms: ${goTerms.join(', ')}` : '',
      pathwayTerms.length ? `Pathway identifiers: ${pathwayTerms.join(', ')}` : '',
      dbXrefs.length ? `Database cross-references: ${dbXrefs.join(', ')}` : '',
      pmids.length ? `Supporting literature: ${pmids.map(pmid => `PMID:${pmid}`).join(', ')}` : '',
    ].filter(Boolean).join('\n');

    return {
      title: proteinName,
      content,
      url: `https://www.uniprot.org/uniprotkb/${accession}/entry`,
      database: 'uniprot',
      geneSymbol,
      organism: actualOrganism || organism,
      sourceId: `UniProtKB:${accession}`,
      targetMatch,
      provenance: {
        provider: 'uniprot',
        recordId: accession,
        matchedBy: [
          ...(exactProteinMatch ? ['protein_id'] : []),
          ...(exactLocusMatch ? ['locus_tag'] : []),
          ...(exactTaxonMatch ? ['taxon_id'] : []),
          ...(taxonBoundByStableIdentifier ? ['taxon_via_stable_identifier'] : []),
        ],
        actualGeneSymbol: gene,
        actualOrganism,
        actualTaxonId: result.organism?.taxonId,
        locusTags: locusNames,
        proteinIds: [accession],
      },
      confidence: result.entryType === 'UniProtKB reviewed (Swiss-Prot)' ? 0.98 : 0.85,
      evidence: ['database', `UniProtKB:${accession}`, ...pmids.map(pmid => `PMID:${pmid}`)],
      annotation: {
        product: proteinName,
        ecNumbers,
        goTerms,
        pathwayTerms,
        dbXrefs,
        reviewed: result.entryType === 'UniProtKB reviewed (Swiss-Prot)',
      },
      structuredData: {
        geneBasicInfo: {
          geneSymbol: gene,
          organism: result.organism?.scientificName || organism || '',
          geneID: geneId || '',
          alternativeNames: aliases,
          geneType: 'protein_coding',
          description: functions[0] || proteinName,
        },
        functionalData: {
          molecularFunction: functions,
          biologicalProcess: pathways,
          cellularComponent: locations,
          catalyticActivity: catalyticActivities.join('; '),
          enzymeClassification: ecNumbers[0] || '',
        },
        proteinInfo: {
          uniprotId: accession,
          proteinName,
          proteinSize: result.sequence?.length || 0,
          molecularWeight: result.sequence?.molWeight || 0,
          subcellularLocation: locations,
          proteinDomains: families,
          catalyticActivity: catalyticActivities.join('; '),
        },
      },
      type: 'protein' as const,
    };
  });
}

function parseNCBIGeneResults(
  xmlData: string,
  geneSymbol?: string,
  organism?: string,
  locusTag?: string,
  proteinId?: string,
  proteinLinkedGeneIds: ReadonlySet<string> = new Set(),
): GeneSource[] {
  return splitXmlBlocks(xmlData, 'Entrezgene').map((gene) => {
    const geneId = extractTag(gene, 'Gene-track_geneid');
    const locus = extractTag(gene, 'Gene-ref_locus') || geneSymbol || geneId || 'Unknown gene';
    const actualLocusTag = extractTag(gene, 'Gene-ref_locus-tag');
    const actualOrganism = extractTag(gene, 'Org-ref_taxname') || organism || '';
    const description = extractTag(gene, 'Gene-ref_desc');
    const summary = extractTag(gene, 'Entrezgene_summary');
    const locusMatch = Boolean(locusTag && identifiersEqual(actualLocusTag, locusTag));
    const symbolMatch = Boolean(geneSymbol && identifiersEqual(locus, geneSymbol));
    const proteinGeneLinkMatch = Boolean(geneId && proteinLinkedGeneIds.has(geneId));
    const organismMatch = organismNamesCompatible(actualOrganism, organism);
    const targetMatch = (locusMatch || proteinGeneLinkMatch || (!locusTag && !proteinId && symbolMatch))
      && organismMatch;
    const url = geneId ? `https://www.ncbi.nlm.nih.gov/gene/${geneId}` : 'https://www.ncbi.nlm.nih.gov/gene/';

    return {
      title: `${locus}${description ? ` - ${description}` : ''}`,
      content: [
        geneId ? `NCBI Gene ID: ${geneId}` : '',
        proteinGeneLinkMatch ? `Resolved from NCBI protein accession: ${proteinId}` : '',
        description ? `Description: ${description}` : '',
        summary ? `Summary: ${summary}` : ''
      ].filter(Boolean).join('\n') || 'NCBI Gene record returned without a parsed summary.',
      url,
      database: 'ncbi_gene',
      geneSymbol,
      organism: actualOrganism,
      sourceId: geneId ? `GeneID:${geneId}` : undefined,
      targetMatch,
      provenance: {
        provider: 'ncbi_gene',
        recordId: geneId,
        matchedBy: [
          ...(locusMatch ? ['locus_tag'] : []),
          ...(proteinGeneLinkMatch ? ['protein_gene_link'] : []),
          ...(symbolMatch ? ['gene_symbol'] : []),
          ...(organismMatch ? ['organism_name'] : []),
        ],
        actualGeneSymbol: locus,
        actualOrganism,
        locusTags: actualLocusTag ? [actualLocusTag] : [],
        proteinIds: proteinGeneLinkMatch && proteinId ? [proteinId] : [],
      },
      confidence: 0.9,
      evidence: ['database', geneId ? `GeneID:${geneId}` : 'ncbi_gene'],
      annotation: geneId ? { dbXrefs: [`GeneID:${geneId}`] } : undefined,
      structuredData: {
        geneBasicInfo: {
          geneSymbol: locus,
          organism: actualOrganism,
          geneID: geneId,
          alternativeNames: actualLocusTag ? [actualLocusTag] : [],
          geneType: 'protein_coding',
          description: description || summary,
        },
      },
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

function parseKEGGResults(
  data: string,
  geneSymbol?: string,
  organism?: string,
  locusTag?: string,
  organismCode?: string,
): GeneSource[] {
  return data
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [entry, description = ''] = line.split('\t');
      const product = description.includes(';') ? description.split(';').slice(1).join(';').trim() : '';
      const entryParts = entry.split(':');
      const actualLocusTag = entryParts[1] || entryParts[0];
      const exactEntry = Boolean(
        locusTag
        && identifiersEqual(actualLocusTag, locusTag)
        && (!organismCode || entryParts.length < 2 || identifiersEqual(entryParts[0], organismCode))
      );
      const ecNumbers = Array.from(description.matchAll(/\bEC:?\s*([0-9]+(?:\.[0-9-]+){3})\b/gi))
        .map(match => match[1]);
      const entryGeneSymbol = description.split(';')[0]?.trim().split(/\s+/).find(value =>
        geneSymbol && identifiersEqual(value, geneSymbol)
      ) || geneSymbol;
      const url = `https://www.genome.jp/entry/${encodeURIComponent(entry)}`;
      return {
        title: `${entry}: ${description.split(';')[0] || geneSymbol || 'KEGG gene match'}`,
        content: `KEGG entry: ${entry}\nDescription: ${description || 'No KEGG description returned.'}`,
        url,
        database: 'kegg',
        geneSymbol,
        organism,
        sourceId: `KEGG:${entry}`,
        targetMatch: exactEntry,
        provenance: {
          provider: 'kegg',
          recordId: entry,
          matchedBy: exactEntry ? ['locus_tag', 'organism_code'] : [],
          actualGeneSymbol: entryGeneSymbol,
          actualOrganism: organism,
          locusTags: actualLocusTag ? [actualLocusTag] : [],
        },
        confidence: 0.8,
        evidence: ['pathway', 'database'],
        annotation: {
          ecNumbers,
          dbXrefs: [`KEGG:${entry}`],
        },
        structuredData: {
          geneBasicInfo: {
            geneSymbol: entryGeneSymbol,
            organism: organism || '',
            alternativeNames: [actualLocusTag].filter(Boolean),
            geneType: 'protein_coding',
            description: product || description,
          },
          functionalData: {
            molecularFunction: product ? [product] : [],
            biologicalProcess: [],
            cellularComponent: [],
            catalyticActivity: '',
            enzymeClassification: ecNumbers[0] || '',
          },
          proteinInfo: {
            proteinName: product,
          },
        },
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
