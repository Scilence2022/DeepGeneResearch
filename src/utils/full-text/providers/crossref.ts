import { createPoliteFetcher, type PoliteFetcher } from '../http';
import type { WorkMetadata } from '../types';

const CROSSREF_BASE = 'https://api.crossref.org';

// Crossref's polite pool tolerates ~50 req/s; we stay well under it.
let fetcher: PoliteFetcher | null = null;

function crossrefFetcher(): PoliteFetcher {
  fetcher ??= createPoliteFetcher({ provider: 'crossref', requestsPerSecond: 10 });
  return fetcher;
}

/**
 * Metadata enrichment: DOI -> Crossref work record. Extracts the license
 * (preferring the version-of-record entry), the publisher text-mining link,
 * and the retraction signal from update-to/update-of relations. A 404 means
 * Crossref does not index the DOI; null also when nothing useful was found.
 */
export async function fetchCrossrefWorkMetadata(
  doi: string,
  options?: { mailto?: string },
): Promise<WorkMetadata | null> {
  const normalized = String(doi || '').trim();
  if (!normalized) return null;
  const mailto = String(options?.mailto || '').trim();
  const url = `${CROSSREF_BASE}/works/${encodeURIComponent(normalized)}${mailto ? `?mailto=${encodeURIComponent(mailto)}` : ''}`;
  let message: any;
  try {
    message = (await crossrefFetcher().fetchJson<{ message?: any }>(url))?.message;
  } catch (error) {
    if (/404\b/.test(error instanceof Error ? error.message : String(error))) return null;
    throw error;
  }
  if (!message || typeof message !== 'object') return null;

  const licenses = Array.isArray(message.license) ? message.license : [];
  const vorLicense = licenses.find((entry: any) => entry?.['content-version'] === 'vor');
  const licenseUrl = String((vorLicense ?? licenses[0])?.URL || '').trim() || undefined;

  const links = Array.isArray(message.link) ? message.link : [];
  const textMiningUrl =
    String(links.find((entry: any) => entry?.['intended-application'] === 'text-mining')?.URL || '').trim() ||
    undefined;

  const updates = [
    ...(Array.isArray(message['update-to']) ? message['update-to'] : []),
    ...(Array.isArray(message['update-of']) ? message['update-of'] : []),
  ];
  const isRetracted = updates.some((entry: any) => entry?.type === 'retraction') || undefined;

  if (!licenseUrl && !textMiningUrl && !isRetracted) return null;
  return {
    ...(licenseUrl ? { license: licenseUrl } : {}),
    ...(textMiningUrl ? { textMiningUrl } : {}),
    ...(isRetracted ? { isRetracted: true } : {}),
  };
}
