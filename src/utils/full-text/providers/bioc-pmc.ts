import { createPoliteFetcher, type PoliteFetcher } from '../http';
import type { AcquiredContent } from '../types';
import { segmentBiocDocument } from '../segment/bioc';

const BIOC_PMC_BASE = 'https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi';

// Module-level lazy fetcher so the 3 req/s NCBI courtesy limit is enforced
// across calls.
let fetcher: PoliteFetcher | null = null;

function biocPmcFetcher(): PoliteFetcher {
  fetcher ??= createPoliteFetcher({ provider: 'bioc_pmc', requestsPerSecond: 3 });
  return fetcher;
}

function is404(error: unknown): boolean {
  return /404\b/.test(error instanceof Error ? error.message : String(error));
}

/**
 * acquire stage: PMCID -> NCBI BioC-PMC RESTful BioC JSON (BioC structure for
 * PMC OA full text WITHOUT PubTator annotations) normalized into the shared
 * document model. The endpoint accepts both 'PMC12345' and '12345'; we
 * normalize to the bare numeric id since that form is unambiguous. A 404 or
 * an empty/too-short payload means the record is not in the PMC OA subset,
 * which is the normal "absent" outcome rather than a retrieval failure.
 */
export async function acquireBiocPmcFullText(pmcid: string): Promise<AcquiredContent | null> {
  const bareId = String(pmcid || '').trim().replace(/^PMC/i, '');
  if (!/^\d+$/.test(bareId)) return null;
  const normalizedPmcid = `PMC${bareId}`;
  const sourceUrl = `${BIOC_PMC_BASE}/BioC_json/${encodeURIComponent(bareId)}/unicode`;
  let payload: unknown;
  try {
    payload = await biocPmcFetcher().fetchJson(sourceUrl);
  } catch (error) {
    if (is404(error)) return null;
    throw error;
  }
  const result = segmentBiocDocument(payload, { pmcid: normalizedPmcid, sourceUrl });
  if (!result) return null;
  return {
    provider: 'bioc_pmc',
    format: 'bioc',
    document: result.document,
    ...(result.annotations.length > 0 ? { providerAnnotations: result.annotations } : {}),
  };
}
