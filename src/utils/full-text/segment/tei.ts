import { createHash } from 'crypto';
import {
  FULL_TEXT_CANONICALIZATION,
  FULL_TEXT_OFFSET_ENCODING,
  MAX_FULL_TEXT_CHARACTERS,
  pmcXmlToText,
  type FullTextDocument,
} from '@/utils/gene-research/full-text';

const MIN_TEI_TEXT_CHARACTERS = 1_000;

export interface TeiSegmentMeta {
  doi?: string;
  pmid?: string;
  pmcid?: string;
  openalexId?: string;
  sourceUrl?: string;
  retrievedAt?: string;
  name?: string;
}

/**
 * segment stage: OpenAlex GROBID TEI XML -> shared document model. GROBID
 * output keeps the article body in <text><body>, which pmcXmlToText already
 * extracts and strips, so the JATS helper is reused verbatim. Returns null
 * when the TEI carries no usable body text.
 */
export function segmentTeiDocument(xml: string, meta: TeiSegmentMeta): FullTextDocument | null {
  const text = pmcXmlToText(xml);
  if (text.length < MIN_TEI_TEXT_CHARACTERS) return null;
  if (text.length > MAX_FULL_TEXT_CHARACTERS) {
    throw new Error(`${meta.openalexId || meta.doi || 'tei'} exceeds the ${MAX_FULL_TEXT_CHARACTERS}-character full-text limit`);
  }
  return {
    schema: 'dgr.full-text-document.v1',
    origin: 'tei',
    name: meta.name || `${meta.openalexId || meta.doi || 'tei'}.tei.xml`,
    mediaType: 'application/xml',
    documentSha256: createHash('sha256').update(xml).digest('hex'),
    text,
    textSha256: createHash('sha256').update(text).digest('hex'),
    textLength: text.length,
    canonicalization: FULL_TEXT_CANONICALIZATION,
    offsetEncoding: FULL_TEXT_OFFSET_ENCODING,
    pageCount: null,
    parsedPageCount: null,
    parseCoverage: 1,
    pages: [],
    identifiers: {
      pmid: meta.pmid,
      pmcid: meta.pmcid,
      doi: meta.doi,
    },
    sourceUrl: meta.sourceUrl,
    retrievedAt: meta.retrievedAt || new Date().toISOString(),
    parser: 'openalex-grobid-tei',
  };
}
