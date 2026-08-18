import { createHash } from 'crypto';
import { fetchPublicText } from '@/utils/safe-public-fetch';
import { loadResearchDocument } from '@/services/research-document-store';

export const FULL_TEXT_CANONICALIZATION = 'dgr.full-text.v1' as const;
export const FULL_TEXT_OFFSET_ENCODING = 'utf16_code_units' as const;
export const MAX_FULL_TEXT_CHARACTERS = 750_000;

export type FullTextOrigin = 'user_upload' | 'pmc_xml' | 'bioc' | 'tei' | 'pdf' | 'snippet';

export interface FullTextPage {
  pageNumber: number;
  start: number;
  end: number;
  textSha256: string;
}

export interface FullTextDocument {
  schema: 'dgr.full-text-document.v1';
  origin: FullTextOrigin;
  name: string;
  mediaType: string;
  documentSha256: string;
  text: string;
  textSha256: string;
  textLength: number;
  canonicalization: typeof FULL_TEXT_CANONICALIZATION;
  offsetEncoding: typeof FULL_TEXT_OFFSET_ENCODING;
  pageCount: number | null;
  parsedPageCount: number | null;
  parseCoverage: number;
  pages: FullTextPage[];
  identifiers: { pmid?: string; doi?: string; pmcid?: string };
  sourceUrl?: string;
  retrievedAt: string;
  parser: string;
}

export interface FullTextEvidenceSpan {
  kind: 'full_text_span';
  category: 'identity' | 'function' | 'structure' | 'pathway' | 'regulation' | 'expression' | 'interaction' | 'phenotype';
  excerpt: string;
  excerptSha256: string;
  excerptStart: number;
  excerptEnd: number;
  textSha256: string;
  textLength: number;
  canonicalization: typeof FULL_TEXT_CANONICALIZATION;
  offsetEncoding: typeof FULL_TEXT_OFFSET_ENCODING;
  pageNumber?: number;
}

interface FullTextTarget {
  geneSymbol: string;
  organism: string;
  locusTag?: string | null;
  proteinId?: string | null;
  identityTerms?: string[];
}

const CATEGORY_PATTERNS: Array<[FullTextEvidenceSpan['category'], RegExp]> = [
  ['regulation', /\b(?:alloster\w*|attenuat\w*|feedback|induc\w*|inhibit\w*|operators?|promoters?|regulat\w*|repress\w*|riboswitch\w*|transcription\w*)\b/i],
  ['structure', /\b(?:active\s+site|conformation\w*|crystal\w*|domain\w*|residues?|structur\w*)\b/i],
  ['pathway', /\b(?:biosynth\w*|metabolic\w*|pathways?|flux)\b/i],
  ['phenotype', /\b(?:auxotroph\w*|delet\w*|growth|knockout\w*|mutants?|phenotyp\w*|resistan\w*)\b/i],
  ['expression', /\b(?:abundan\w*|express\w*|mrna|transcripts?|translation\w*)\b/i],
  ['interaction', /\b(?:bind\w*|complex\w*|interact\w*|partner\w*)\b/i],
  ['identity', /\b(?:clon\w*|coding\s+sequence|encod\w*|genes?|locus|nucleotide\s+sequence|sequence\s+determined)\b/i],
  ['function', /\b(?:activity|affinity|cataly\w*|convert\w*|encod\w*|enzyme\w*|function\w*|kinetic\w*|phosphorylat\w*|substrates?)\b/i],
];
const RESULT_PATTERN = /\b(?:activat\w*|affect\w*|bind\w*|cataly\w*|caus\w*|control\w*|convert\w*|decreas\w*|demonstrat\w*|determin\w*|encod\w*|enhanc\w*|establish\w*|find|found|identif\w*|increas\w*|indicat\w*|inhibit\w*|involv\w*|lead\w*|observ\w*|reduc\w*|regulat\w*|repress\w*|requir\w*|responsible|result\w*|reveal\w*|show|shown|shows|suggest\w*)\b/i;
const HARD_COLLISION = /\blysozyme\s*c(?:-?\d+)?\b|\b(?:lys[-\s]?c|lysyl\s+endopeptidase)\b[^.]{0,90}\b(?:digest\w*|proteas\w*|proteolysis|sample\s+processing)\b|\b(?:bacteriophages?|phages?)\b[^.]{0,120}\b(?:lysis|lytic|lysc)\b/i;

export function canonicalizeFullText(value: unknown): string {
  return String(value || '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeXmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"',
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    return named[entity.toLowerCase()] ?? `&${entity};`;
  });
}

export async function parseUserResearchPdf(documentId: string): Promise<FullTextDocument> {
  const { descriptor, bytes } = await loadResearchDocument(documentId);
  const { segmentPdfDocument } = await import('@/utils/full-text/segment/pdf');
  return segmentPdfDocument({
    bytes: new Uint8Array(bytes),
    name: descriptor.name,
    mediaType: descriptor.mediaType,
    documentSha256: descriptor.sha256,
    retrievedAt: descriptor.uploadedAt,
    origin: 'user_upload',
  });
}

export function pmcXmlToText(xml: string): string {
  const body = xml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || xml;
  return canonicalizeFullText(decodeXmlEntities(
    body
      .replace(/<title\b[^>]*>([\s\S]*?)<\/title>/gi, '\n\n$1\n')
      .replace(/<p\b[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ));
}

/**
 * Compatibility wrapper kept for the gene-research engine and its tests. The
 * acquisition logic lives in the full-text provider layer; the dynamic import
 * avoids a static cycle (the provider reuses pmcXmlToText from this module).
 */
export async function retrieveEuropePmcFullText(pmid: string): Promise<FullTextDocument | null> {
  if (!/^\d{5,10}$/.test(pmid)) return null;
  const { resolveEuropePmcWork, acquireEuropePmcJats } = await import('@/utils/full-text/providers/europe-pmc');
  const work = await resolveEuropePmcWork({ pmid });
  if (!work?.pmcid) return null;
  return acquireEuropePmcJats({ ...work, pmid: work.pmid ?? pmid });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasIdentity(text: string, terms: string[]): boolean {
  return terms.some(term => new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(term)}(?=$|[^A-Za-z0-9])`, 'i').test(text));
}

export function buildFullTextEvidenceSpans(
  document: FullTextDocument,
  target: FullTextTarget,
  maxFindings = 12,
): FullTextEvidenceSpan[] {
  const terms = Array.from(new Set([
    target.geneSymbol,
    target.locusTag,
    target.proteinId,
    ...(target.identityTerms || []),
  ].map(value => String(value || '').trim()).filter(value => value.length >= 3)));
  if (terms.length === 0) return [];

  const sentences: Array<{ text: string; start: number; end: number }> = [];
  let start = 0;
  for (const match of document.text.matchAll(/[.!?](?=\s+[A-Z0-9(]|$)/g)) {
    const end = (match.index || 0) + match[0].length;
    if (end > start) sentences.push({ text: document.text.slice(start, end).trim(), start, end });
    start = end;
    while (/\s/.test(document.text[start] || '')) start += 1;
  }
  if (start < document.text.length) sentences.push({ text: document.text.slice(start).trim(), start, end: document.text.length });

  const results: FullTextEvidenceSpan[] = [];
  const seen = new Set<string>();
  const perCategory = new Map<string, number>();
  // The per-category cap keeps one prolific category from crowding out the
  // rest, but scales with the requested budget so comprehensive runs surface
  // more verifiable result statements per document.
  const perCategoryLimit = Math.max(3, Math.ceil(maxFindings / 6));
  for (let index = 0; index < sentences.length && results.length < maxFindings; index += 1) {
    const sentence = sentences[index];
    if (sentence.text.length < 30 || sentence.text.length > 900 || !RESULT_PATTERN.test(sentence.text)) continue;
    const category = CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(sentence.text))?.[0];
    if (!category || (perCategory.get(category) || 0) >= perCategoryLimit) continue;
    const contextIndex = hasIdentity(sentence.text, terms)
      ? index
      : index > 0 && hasIdentity(sentences[index - 1].text, terms)
        ? index - 1
        : -1;
    if (contextIndex < 0) continue;
    const excerptStart = sentences[contextIndex].start;
    const excerptEnd = sentence.end;
    const excerpt = document.text.slice(excerptStart, excerptEnd);
    if (excerpt.length > 1_200 || HARD_COLLISION.test(excerpt)) continue;
    const key = excerpt.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    perCategory.set(category, (perCategory.get(category) || 0) + 1);
    const page = document.pages.find(candidate => excerptStart >= candidate.start && excerptStart <= candidate.end);
    results.push({
      kind: 'full_text_span',
      category,
      excerpt,
      excerptSha256: createHash('sha256').update(excerpt).digest('hex'),
      excerptStart,
      excerptEnd,
      textSha256: document.textSha256,
      textLength: document.textLength,
      canonicalization: document.canonicalization,
      offsetEncoding: document.offsetEncoding,
      ...(page ? { pageNumber: page.pageNumber } : {}),
    });
  }
  return results;
}
