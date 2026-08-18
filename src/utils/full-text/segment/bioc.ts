import { createHash } from 'crypto';
import {
  canonicalizeFullText,
  FULL_TEXT_CANONICALIZATION,
  FULL_TEXT_OFFSET_ENCODING,
  MAX_FULL_TEXT_CHARACTERS,
  type FullTextDocument,
} from '@/utils/gene-research/full-text';
import type { ProviderAnnotation } from '../types';

const MIN_BIOC_TEXT_CHARACTERS = 200;

export interface BiocSegmentResult {
  document: FullTextDocument;
  annotations: ProviderAnnotation[];
}

export interface BiocSegmentMeta {
  pmid?: string;
  pmcid?: string;
  doi?: string;
  sourceUrl?: string;
  retrievedAt?: string;
  name?: string;
}

/**
 * segment stage: PubTator BioC JSON -> shared document model. Passage texts
 * are canonicalized and joined with '\n\n'; raw BioC character offsets do NOT
 * survive canonicalization, so every annotation is emitted with
 * start/end = -1 and the extract stage locates each mention inside the
 * normalized text (same convention as the Europe PMC annotations provider).
 * Returns null when the payload carries no usable text.
 */
export function segmentBiocDocument(payload: any, meta: BiocSegmentMeta): BiocSegmentResult | null {
  const documents = Array.isArray(payload) ? payload : [payload];
  const biocDocument = documents.find(entry => entry && typeof entry === 'object');
  const passages = Array.isArray(biocDocument?.passages) ? biocDocument.passages : [];

  const texts: string[] = [];
  const annotations: ProviderAnnotation[] = [];
  for (const passage of passages) {
    const text = canonicalizeFullText(passage?.text);
    if (text) texts.push(text);
    const list = Array.isArray(passage?.annotations) ? passage.annotations : [];
    for (const annotation of list) {
      const mention = String(annotation?.text || '').trim();
      if (!mention) continue;
      annotations.push({
        type: String(annotation?.infons?.type || 'unknown'),
        identifier: annotation?.infons?.identifier ? String(annotation.infons.identifier) : undefined,
        mention,
        start: -1,
        end: -1,
      });
    }
  }

  const text = texts.join('\n\n');
  if (text.length < MIN_BIOC_TEXT_CHARACTERS) return null;
  if (text.length > MAX_FULL_TEXT_CHARACTERS) {
    throw new Error(`${meta.pmcid || meta.pmid || 'bioc'} exceeds the ${MAX_FULL_TEXT_CHARACTERS}-character full-text limit`);
  }

  const document: FullTextDocument = {
    schema: 'dgr.full-text-document.v1',
    origin: 'bioc',
    name: meta.name || `${meta.pmcid || meta.pmid || 'bioc'}.bioc.json`,
    mediaType: 'application/json',
    documentSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
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
    parser: 'pubtator-bioc',
  };
  return { document, annotations };
}
