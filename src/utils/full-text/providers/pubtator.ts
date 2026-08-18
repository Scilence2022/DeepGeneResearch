import { createPoliteFetcher, type PoliteFetcher } from '../http';
import type { AcquiredContent } from '../types';
import { segmentBiocDocument } from '../segment/bioc';

const PUBTATOR_BASE = 'https://www.ncbi.nlm.nih.gov/research/pubtator3-api';

// Module-level lazy fetchers keyed by key presence so the rate limit is
// enforced across calls: NCBI allows 3 req/s without an API key, 10 with one.
let fetcherWithoutKey: PoliteFetcher | null = null;
let fetcherWithKey: PoliteFetcher | null = null;

function pubtatorFetcher(hasKey: boolean): PoliteFetcher {
  if (hasKey) {
    fetcherWithKey ??= createPoliteFetcher({ provider: 'pubtator', requestsPerSecond: 10 });
    return fetcherWithKey;
  }
  fetcherWithoutKey ??= createPoliteFetcher({ provider: 'pubtator', requestsPerSecond: 3 });
  return fetcherWithoutKey;
}

function withApiKey(url: string, ncbiApiKey?: string): string {
  return ncbiApiKey ? `${url}&api_key=${encodeURIComponent(ncbiApiKey)}` : url;
}

function is404(error: unknown): boolean {
  return /404\b/.test(error instanceof Error ? error.message : String(error));
}

/**
 * acquire stage: PMID -> PubTator3 BioC JSON (full=true yields PMC OA
 * full-text passages) normalized into the shared document model. A 404 or an
 * empty/too-short payload means PubTator has no usable record, which is the
 * normal "absent" outcome rather than a retrieval failure.
 */
export async function acquirePubtatorBioc(
  pmid: string,
  options?: { ncbiApiKey?: string },
): Promise<AcquiredContent | null> {
  const normalized = String(pmid || '').trim();
  if (!/^\d+$/.test(normalized)) return null;
  const sourceUrl = withApiKey(
    `${PUBTATOR_BASE}/publications/export/biocjson?pmids=${encodeURIComponent(normalized)}&full=true`,
    options?.ncbiApiKey,
  );
  let payload: unknown;
  try {
    payload = await pubtatorFetcher(Boolean(options?.ncbiApiKey)).fetchJson(sourceUrl);
  } catch (error) {
    if (is404(error)) return null;
    throw error;
  }
  const result = segmentBiocDocument(payload, { pmid: normalized, sourceUrl });
  if (!result) return null;
  return {
    provider: 'pubtator',
    format: 'bioc',
    document: result.document,
    ...(result.annotations.length > 0 ? { providerAnnotations: result.annotations } : {}),
  };
}

/**
 * resolve helper: PubTator gene autocomplete -> NCBI Gene ID candidates.
 * Returns [] on any non-OK or empty response.
 */
export async function searchPubtatorGeneAutocomplete(
  query: string,
  options?: { ncbiApiKey?: string },
): Promise<Array<{ id: string; name: string }>> {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];
  const url = withApiKey(
    `${PUBTATOR_BASE}/entity/autocomplete/?query=${encodeURIComponent(trimmed)}&concept=gene`,
    options?.ncbiApiKey,
  );
  try {
    const payload = await pubtatorFetcher(Boolean(options?.ncbiApiKey)).fetchJson(url);
    const entries = Array.isArray(payload) ? payload : [];
    const results: Array<{ id: string; name: string }> = [];
    for (const entry of entries) {
      const id = String(entry?.id || '').trim();
      if (!id) continue;
      results.push({ id, name: String(entry?.name || '').trim() });
    }
    return results;
  } catch {
    return [];
  }
}
