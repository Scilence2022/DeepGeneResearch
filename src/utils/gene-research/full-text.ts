import { createHash } from 'crypto';
import { fetchPublicText } from '@/utils/safe-public-fetch';
import { loadResearchDocument } from '@/services/research-document-store';

export const FULL_TEXT_CANONICALIZATION = 'dgr.full-text.v1' as const;
export const FULL_TEXT_OFFSET_ENCODING = 'utf16_code_units' as const;
export const MAX_FULL_TEXT_CHARACTERS = 750_000;

export type FullTextOrigin = 'user_upload' | 'pmc_xml';

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

function extractIdentifiers(text: string): { pmid?: string; doi?: string } {
  const pmid = text.match(/\bPMID\s*[: ]\s*(\d{5,10})\b/i)?.[1];
  const doi = text.match(/\b(10\.\d{4,9}\/[\-._;()/:A-Z0-9]+)\b/i)?.[1]?.replace(/[),.;\]]+$/, '');
  return { pmid, doi };
}

export async function parseUserResearchPdf(documentId: string): Promise<FullTextDocument> {
  const { descriptor, bytes } = await loadResearchDocument(documentId);
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const pageCount = document.numPages;
  const pageTexts: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = canonicalizeFullText(
        textContent.items
          .filter((item: any) => typeof item?.str === 'string')
          .map((item: any) => item.str)
          .join(' '),
      );
      pageTexts.push(text);
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

  const pages: FullTextPage[] = [];
  let text = '';
  for (let index = 0; index < pageTexts.length; index += 1) {
    if (text && pageTexts[index]) text += '\n\n';
    const start = text.length;
    text += pageTexts[index];
    pages.push({
      pageNumber: index + 1,
      start,
      end: text.length,
      textSha256: createHash('sha256').update(pageTexts[index]).digest('hex'),
    });
  }
  if (text.length < 200) {
    throw new Error(`${descriptor.name} did not contain extractable PDF text; OCR is required`);
  }
  if (text.length > MAX_FULL_TEXT_CHARACTERS) {
    throw new Error(`${descriptor.name} exceeds the ${MAX_FULL_TEXT_CHARACTERS}-character full-text limit`);
  }
  const parsedPageCount = pageTexts.filter(page => page.length >= 20).length;
  return {
    schema: 'dgr.full-text-document.v1',
    origin: 'user_upload',
    name: descriptor.name,
    mediaType: descriptor.mediaType,
    documentSha256: descriptor.sha256,
    text,
    textSha256: createHash('sha256').update(text).digest('hex'),
    textLength: text.length,
    canonicalization: FULL_TEXT_CANONICALIZATION,
    offsetEncoding: FULL_TEXT_OFFSET_ENCODING,
    pageCount,
    parsedPageCount,
    parseCoverage: pageCount > 0 ? parsedPageCount / pageCount : 0,
    pages,
    identifiers: extractIdentifiers(text.slice(0, 30_000)),
    retrievedAt: descriptor.uploadedAt,
    parser: 'pdfjs-dist',
  };
}

function pmcXmlToText(xml: string): string {
  const body = xml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || xml;
  return canonicalizeFullText(decodeXmlEntities(
    body
      .replace(/<title\b[^>]*>([\s\S]*?)<\/title>/gi, '\n\n$1\n')
      .replace(/<p\b[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  ));
}

export async function retrieveEuropePmcFullText(pmid: string): Promise<FullTextDocument | null> {
  if (!/^\d{5,10}$/.test(pmid)) return null;
  const searchUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`EXT_ID:${pmid} AND SRC:MED`)}&format=json`;
  const search = await fetchPublicText(searchUrl, { maxBytes: 1_000_000, timeoutMs: 15_000 });
  const result = JSON.parse(search.body)?.resultList?.result?.[0];
  const pmcid = String(result?.pmcid || '').trim().toUpperCase();
  if (!/^PMC\d+$/.test(pmcid)) return null;

  const sourceUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`;
  const response = await fetchPublicText(sourceUrl, { maxBytes: 12_000_000, timeoutMs: 25_000 });
  const text = pmcXmlToText(response.body);
  if (text.length < 1_000) return null;
  if (text.length > MAX_FULL_TEXT_CHARACTERS) {
    throw new Error(`${pmcid} exceeds the ${MAX_FULL_TEXT_CHARACTERS}-character full-text limit`);
  }
  const documentSha256 = createHash('sha256').update(response.body).digest('hex');
  return {
    schema: 'dgr.full-text-document.v1',
    origin: 'pmc_xml',
    name: `${pmcid}.xml`,
    mediaType: 'application/xml',
    documentSha256,
    text,
    textSha256: createHash('sha256').update(text).digest('hex'),
    textLength: text.length,
    canonicalization: FULL_TEXT_CANONICALIZATION,
    offsetEncoding: FULL_TEXT_OFFSET_ENCODING,
    pageCount: null,
    parsedPageCount: null,
    parseCoverage: 1,
    pages: [],
    identifiers: { pmid, pmcid, doi: result?.doi ? String(result.doi) : undefined },
    sourceUrl,
    retrievedAt: new Date().toISOString(),
    parser: 'europe-pmc-xml',
  };
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
  for (let index = 0; index < sentences.length && results.length < maxFindings; index += 1) {
    const sentence = sentences[index];
    if (sentence.text.length < 30 || sentence.text.length > 900 || !RESULT_PATTERN.test(sentence.text)) continue;
    const category = CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(sentence.text))?.[0];
    if (!category || (perCategory.get(category) || 0) >= 3) continue;
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
