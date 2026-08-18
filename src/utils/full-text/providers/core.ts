import { createPoliteFetcher, type PoliteFetcher } from '../http';
import type { WorkMetadata } from '../types';

const CORE_DISCOVER_URL = 'https://api.core.ac.uk/v3/discover';

// Module-level lazy fetchers keyed by key presence so the rate limit is
// enforced across calls: CORE allows 10 req/s with an API key and roughly
// one request per 10 seconds anonymously.
let fetcherWithKey: PoliteFetcher | null = null;
let fetcherWithoutKey: PoliteFetcher | null = null;

function coreFetcher(hasKey: boolean): PoliteFetcher {
  if (hasKey) {
    fetcherWithKey ??= createPoliteFetcher({ provider: 'core', requestsPerSecond: 10 });
    return fetcherWithKey;
  }
  fetcherWithoutKey ??= createPoliteFetcher({ provider: 'core', requestsPerSecond: 0.1 });
  return fetcherWithoutKey;
}

function looksLikeFullTextUrl(url: string): boolean {
  return /\.pdf($|[?#])/i.test(url) || /download|fulltext|full-text|\/pdf\//i.test(url);
}

function collectCandidateUrls(payload: any): string[] {
  const candidates: string[] = [];
  if (typeof payload?.fullTextLink === 'string') candidates.push(payload.fullTextLink);
  if (typeof payload?.downloadUrl === 'string') candidates.push(payload.downloadUrl);
  const links = Array.isArray(payload?.links) ? payload.links : [];
  for (const link of links) {
    if (typeof link === 'string') candidates.push(link);
    else if (typeof link?.url === 'string') candidates.push(link.url);
  }
  return candidates.map(url => url.trim()).filter(url => /^https?:\/\//i.test(url));
}

/**
 * Metadata enrichment: DOI -> CORE discovery record with a downloadable
 * full-text URL (oaPdfUrl) and the CORE landing page (oaRepositoryUrl).
 * The v3 discover response shape has drifted over time, so the full-text
 * link is extracted defensively from fullTextLink / downloadUrl / links[].
 * Returns null when CORE has no usable record for the DOI.
 */
export async function discoverCoreFullText(
  doi: string,
  options?: { apiKey?: string },
): Promise<WorkMetadata | null> {
  const normalized = String(doi || '').trim();
  if (!normalized) return null;
  const apiKey = String(options?.apiKey || '').trim();
  let payload: any;
  try {
    payload = await coreFetcher(Boolean(apiKey)).fetchJson(CORE_DISCOVER_URL, {
      init: {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({ doi: normalized }),
      },
    });
  } catch (error) {
    if (/\bHTTP 404\b/.test(error instanceof Error ? error.message : String(error))) return null;
    throw error;
  }

  const urls = collectCandidateUrls(payload);
  const oaPdfUrl = urls.find(looksLikeFullTextUrl);
  const oaRepositoryUrl = urls.find(url => url !== oaPdfUrl && !looksLikeFullTextUrl(url));
  if (!oaPdfUrl && !oaRepositoryUrl) return null;
  return {
    ...(oaPdfUrl ? { oaPdfUrl } : {}),
    ...(oaRepositoryUrl ? { oaRepositoryUrl } : {}),
  };
}
