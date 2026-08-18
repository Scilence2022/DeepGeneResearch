import { createPoliteFetcher, type PoliteFetcher } from '../http';
import type { CandidateWork } from '../types';

const IDCONV_BASE = 'https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/';

// API limit: at most 200 ids per request.
const MAX_IDS_PER_REQUEST = 200;

// Module-level lazy fetchers keyed by key presence so the rate limit is
// enforced across calls: NCBI allows 3 req/s without an API key, 10 with one.
let fetcherWithoutKey: PoliteFetcher | null = null;
let fetcherWithKey: PoliteFetcher | null = null;

function idconvFetcher(hasKey: boolean): PoliteFetcher {
  if (hasKey) {
    fetcherWithKey ??= createPoliteFetcher({ provider: 'ncbi_idconv', requestsPerSecond: 10 });
    return fetcherWithKey;
  }
  fetcherWithoutKey ??= createPoliteFetcher({ provider: 'ncbi_idconv', requestsPerSecond: 3 });
  return fetcherWithoutKey;
}

interface IdconvRecord {
  pmid?: string;
  pmcid?: string;
  doi?: string;
  errmsg?: string;
}

/**
 * resolve helper: NCBI ID Converter batch DOI <-> PMID <-> PMCID. Records
 * carrying an `errmsg` (unknown/invalid id) are skipped. PMCIDs are
 * normalized to the uppercase `PMC\d+` form. Requests are chunked to the
 * 200-ids-per-request API limit.
 */
export async function convertPublicationIds(
  ids: string[],
  options?: { apiKey?: string },
): Promise<CandidateWork[]> {
  const normalized = ids.map(id => id.trim()).filter(Boolean);
  if (normalized.length === 0) return [];
  const fetcher = idconvFetcher(Boolean(options?.apiKey));
  const works: CandidateWork[] = [];
  for (let start = 0; start < normalized.length; start += MAX_IDS_PER_REQUEST) {
    const chunk = normalized.slice(start, start + MAX_IDS_PER_REQUEST);
    let url = `${IDCONV_BASE}?ids=${encodeURIComponent(chunk.join(','))}&format=json`;
    if (options?.apiKey) url += `&api_key=${encodeURIComponent(options.apiKey)}`;
    const payload = await fetcher.fetchJson<{ records?: IdconvRecord[] }>(url);
    const records = Array.isArray(payload?.records) ? payload.records : [];
    for (const record of records) {
      if (record?.errmsg) continue;
      const pmcid = String(record?.pmcid || '').trim().toUpperCase();
      works.push({
        pmid: record?.pmid ? String(record.pmid) : undefined,
        pmcid: /^PMC\d+$/.test(pmcid) ? pmcid : undefined,
        doi: record?.doi ? String(record.doi) : undefined,
      });
    }
  }
  return works;
}
