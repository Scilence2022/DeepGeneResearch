import { createHash } from 'crypto';
import { fetchPublicText } from '@/utils/safe-public-fetch';
import {
  FULL_TEXT_CANONICALIZATION,
  FULL_TEXT_OFFSET_ENCODING,
  MAX_FULL_TEXT_CHARACTERS,
  pmcXmlToText,
  type FullTextDocument,
} from '@/utils/gene-research/full-text';
import type { CandidateWork, ProviderAnnotation } from '../types';

const EPMC_BASE = 'https://www.ebi.ac.uk/europepmc/webservices/rest';
const ANNOTATIONS_BASE = 'https://www.ebi.ac.uk/europepmc/annotations_api';

/**
 * resolve stage: PMID or DOI -> Europe PMC record (adds PMCID / title /
 * preprint flag). Returns null when Europe PMC does not index the work.
 */
export async function resolveEuropePmcWork(
  anchor: { pmid?: string; doi?: string },
): Promise<CandidateWork | null> {
  let query: string;
  if (anchor.pmid && /^\d{5,10}$/.test(anchor.pmid)) {
    query = `EXT_ID:${anchor.pmid} AND SRC:MED`;
  } else if (anchor.doi) {
    query = `DOI:"${anchor.doi.replace(/"/g, '')}"`;
  } else {
    return null;
  }
  const searchUrl = `${EPMC_BASE}/search?query=${encodeURIComponent(query)}&format=json&resultType=core`;
  const search = await fetchPublicText(searchUrl, { maxBytes: 1_000_000, timeoutMs: 15_000 });
  const result = JSON.parse(search.body)?.resultList?.result?.[0];
  if (!result) return null;
  const pmcid = String(result.pmcid || '').trim().toUpperCase();
  return {
    pmid: result.pmid ? String(result.pmid) : anchor.pmid,
    pmcid: /^PMC\d+$/.test(pmcid) ? pmcid : undefined,
    doi: result.doi ? String(result.doi) : anchor.doi,
    title: result.title ? String(result.title) : undefined,
    isPreprint: String(result.source || '') === 'PPR',
  };
}

/**
 * acquire stage: PMCID -> JATS full text normalized into the shared document
 * model. A 404 means the record has no publisher-open full text, which is the
 * normal "no open full text" outcome rather than a retrieval failure.
 */
export async function acquireEuropePmcJats(
  work: CandidateWork,
): Promise<FullTextDocument | null> {
  const pmcid = String(work.pmcid || '').trim().toUpperCase();
  if (!/^PMC\d+$/.test(pmcid)) return null;

  const sourceUrl = `${EPMC_BASE}/${pmcid}/fullTextXML`;
  let response: Awaited<ReturnType<typeof fetchPublicText>>;
  try {
    response = await fetchPublicText(sourceUrl, { maxBytes: 12_000_000, timeoutMs: 25_000 });
  } catch (error) {
    if (/404\b/.test(error instanceof Error ? error.message : String(error))) return null;
    throw error;
  }
  const text = pmcXmlToText(response.body);
  if (text.length < 1_000) return null;
  if (text.length > MAX_FULL_TEXT_CHARACTERS) {
    throw new Error(`${pmcid} exceeds the ${MAX_FULL_TEXT_CHARACTERS}-character full-text limit`);
  }
  return {
    schema: 'dgr.full-text-document.v1',
    origin: 'pmc_xml',
    name: `${pmcid}.xml`,
    mediaType: 'application/xml',
    documentSha256: createHash('sha256').update(response.body).digest('hex'),
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
      pmid: work.pmid,
      pmcid,
      doi: work.doi,
    },
    sourceUrl,
    retrievedAt: new Date().toISOString(),
    parser: 'europe-pmc-xml',
  };
}

/**
 * Europe PMC Annotations API: entity annotations (Gene_Proteins, Organisms,
 * Chemicals, Diseases, ...) computed by Europe PMC over abstracts and open
 * full texts. The API reports positions against its own article rendering,
 * not against our normalized text, so start/end are -1 here; the extract
 * stage locates each mention inside document.text. At most 8 article ids per
 * request (API limit); ids use the `PMC:xxx` / `MED:yyy` form.
 */
export async function fetchEuropePmcAnnotations(
  articleIds: string[],
): Promise<ProviderAnnotation[]> {
  const ids = articleIds.map(id => id.trim()).filter(Boolean).slice(0, 8);
  if (ids.length === 0) return [];
  const url = `${ANNOTATIONS_BASE}/annotationsByArticleIds?articleIds=${encodeURIComponent(ids.join(','))}&format=JSON`;
  let response: Awaited<ReturnType<typeof fetchPublicText>>;
  try {
    response = await fetchPublicText(url, { maxBytes: 4_000_000, timeoutMs: 20_000 });
  } catch (error) {
    if (/404\b/.test(error instanceof Error ? error.message : String(error))) return [];
    throw error;
  }
  const payload = JSON.parse(response.body);
  const articles = Array.isArray(payload) ? payload : [payload];
  const annotations: ProviderAnnotation[] = [];
  for (const article of articles) {
    const list = Array.isArray(article?.annotations) ? article.annotations : [];
    for (const annotation of list) {
      const mention = String(annotation?.exact || '').trim();
      if (!mention) continue;
      annotations.push({
        type: String(annotation?.type || 'unknown'),
        identifier: annotation?.id ? String(annotation.id) : undefined,
        mention,
        start: -1,
        end: -1,
      });
    }
  }
  return annotations;
}

/** Supplementary-material archive endpoint for a PMC record (zip). Recorded for provenance; not unpacked. */
export function europePmcSupplementaryFilesUrl(pmcid: string): string {
  return `${EPMC_BASE}/${encodeURIComponent(pmcid)}/supplementaryFiles`;
}
