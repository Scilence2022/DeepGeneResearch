import { createPoliteFetcher, type PoliteFetcher } from '../http';
import type { WorkMetadata } from '../types';

const UNPAYWALL_BASE = 'https://api.unpaywall.org/v2';

let fetcher: PoliteFetcher | null = null;

function unpaywallFetcher(): PoliteFetcher {
  fetcher ??= createPoliteFetcher({ provider: 'unpaywall', requestsPerSecond: 5 });
  return fetcher;
}

/**
 * Metadata enrichment: DOI -> Unpaywall OA locations (PDF copy / repository
 * landing page). Unpaywall requires a contact email; callers without one
 * configured get null here so the config gate simply skips the provider. A
 * 404 means Unpaywall does not index the DOI.
 */
export async function locateUnpaywallOaCopy(
  doi: string,
  options: { email?: string },
): Promise<WorkMetadata | null> {
  const normalized = String(doi || '').trim();
  const email = String(options?.email || '').trim();
  if (!normalized || !email) return null;
  const url = `${UNPAYWALL_BASE}/${encodeURIComponent(normalized)}?email=${encodeURIComponent(email)}`;
  let payload: any;
  try {
    payload = await unpaywallFetcher().fetchJson(url);
  } catch (error) {
    if (/404\b/.test(error instanceof Error ? error.message : String(error))) return null;
    throw error;
  }
  if (!payload || payload.is_oa === false) return null;

  const best = payload.best_oa_location;
  const locations = Array.isArray(payload.oa_locations) ? payload.oa_locations : [];
  if (!best && locations.length === 0) return null;

  const oaPdfUrl =
    String(best?.url_for_pdf || '').trim() ||
    String(locations.find((entry: any) => entry?.url_for_pdf)?.url_for_pdf || '').trim() ||
    undefined;
  const oaRepositoryUrl =
    best?.host_type === 'repository' ? String(best?.url || '').trim() || undefined : undefined;

  if (!oaPdfUrl && !oaRepositoryUrl) return null;
  return {
    ...(oaPdfUrl ? { oaPdfUrl } : {}),
    ...(oaRepositoryUrl ? { oaRepositoryUrl } : {}),
  };
}
