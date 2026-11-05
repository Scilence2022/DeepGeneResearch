import { createPoliteFetcher, type PoliteFetcher } from '../http';
import { segmentTeiDocument } from '../segment/tei';
import type { AcquiredContent } from '../types';
import { compareWorkIdentity } from '../work-identity';

const OPENALEX_WORKS_BASE = 'https://api.openalex.org/works';
// The OpenAlex content endpoints are billed per download ($0.01/file); the
// default cap matches the free $1/day credit tier so a runaway pipeline
// cannot spend more than that without an explicit override.
const DEFAULT_MAX_DOWNLOADS_PER_DAY = 100;

let fetcher: PoliteFetcher | null = null;

function openAlexFetcher(): PoliteFetcher {
  fetcher ??= createPoliteFetcher({ provider: 'openalex', requestsPerSecond: 5 });
  return fetcher;
}

let downloadDay = '';
let downloadCount = 0;

function downloadsExhausted(maxDownloadsPerDay: number): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (downloadDay !== today) {
    downloadDay = today;
    downloadCount = 0;
  }
  return downloadCount >= maxDownloadsPerDay;
}

function httpStatus(error: unknown): number | null {
  const match = (error instanceof Error ? error.message : String(error)).match(/\bHTTP (\d{3})\b/);
  return match ? Number(match[1]) : null;
}

export interface OpenAlexWorkRef {
  openalexId: string;
  title?: string;
  grobidXmlUrl?: string;
  pdfContentUrl?: string;
  oaPdfUrl?: string;
}

/**
 * resolve stage: DOI -> OpenAlex work record with the content-host download
 * URLs (GROBID TEI / PDF) and the best open-access PDF location. The works
 * API is free and keyless; a 404 means OpenAlex does not index the DOI.
 */
export async function resolveOpenAlexWork(
  doi: string,
  options?: { apiKey?: string; signal?: AbortSignal },
): Promise<OpenAlexWorkRef | null> {
  const normalized = String(doi || '').trim();
  if (!normalized) return null;
  const apiKey = String(options?.apiKey || '').trim();
  const select = 'id,doi,title,open_access,best_oa_location,has_content,content_urls';
  const url = `${OPENALEX_WORKS_BASE}/doi:${encodeURIComponent(normalized)}?select=${select}${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ''}`;
  let payload: any;
  try {
    payload = await openAlexFetcher().fetchJson(url, { signal: options?.signal });
  } catch (error) {
    if (httpStatus(error) === 404) return null;
    throw error;
  }
  const openalexId = String(payload?.id || '').trim();
  if (!openalexId) return null;
  if (compareWorkIdentity({ doi: normalized }, { doi: payload?.doi }) === 'conflict') return null;
  const grobidXmlUrl = String(payload?.content_urls?.grobid_xml || '').trim();
  const pdfContentUrl = String(payload?.content_urls?.pdf || '').trim();
  const oaPdfUrl = String(payload?.best_oa_location?.pdf_url || payload?.open_access?.oa_url || '').trim();
  return {
    openalexId,
    title: payload?.title ? String(payload.title) : undefined,
    ...(grobidXmlUrl ? { grobidXmlUrl } : {}),
    ...(pdfContentUrl ? { pdfContentUrl } : {}),
    ...(oaPdfUrl ? { oaPdfUrl } : {}),
  };
}

/**
 * acquire stage: DOI -> OpenAlex GROBID TEI full text normalized into the
 * shared document model. Content downloads are billed per file and require
 * an API key, so without a key (or once the daily download budget is spent)
 * the provider abstains with null. 401/402/404 on the content host are the
 * normal "not available" outcomes. Reserve budget before sending the request
 * so concurrent tasks share the same daily cap.
 */
export async function acquireOpenAlexTei(
  doi: string,
  options: { apiKey?: string; maxDownloadsPerDay?: number; signal?: AbortSignal },
): Promise<AcquiredContent | null> {
  const apiKey = String(options?.apiKey || '').trim();
  if (!apiKey) return null;
  const maxDownloadsPerDay = options?.maxDownloadsPerDay ?? DEFAULT_MAX_DOWNLOADS_PER_DAY;
  if (downloadsExhausted(maxDownloadsPerDay)) return null;

  const work = await resolveOpenAlexWork(doi, { apiKey, signal: options.signal });
  if (!work?.grobidXmlUrl || downloadsExhausted(maxDownloadsPerDay)) return null;
  let contentUrl: URL;
  try {
    contentUrl = new URL(work.grobidXmlUrl);
  } catch {
    return null;
  }
  const workId = work.openalexId.split('/').pop();
  if (contentUrl.origin !== 'https://content.openalex.org'
    || !/^W\d+$/.test(workId || '') || contentUrl.pathname !== `/works/${workId}.grobid-xml`
    || contentUrl.username || contentUrl.password) return null;
  const sourceUrl = `${contentUrl.origin}${contentUrl.pathname}`;
  const downloadUrl = new URL(sourceUrl);
  downloadUrl.searchParams.set('api_key', apiKey);
  options.signal?.throwIfAborted();
  downloadCount += 1;
  let xml: string;
  try {
    xml = await openAlexFetcher().fetchText(downloadUrl.href, {
      signal: options.signal,
      maxAttempts: 1,
      init: { redirect: 'error' },
    });
  } catch (error) {
    const status = httpStatus(error);
    if (status === 401 || status === 402 || status === 404) return null;
    throw error;
  }
  const document = segmentTeiDocument(xml, {
    doi,
    openalexId: work.openalexId,
    sourceUrl,
    name: `${workId}.tei.xml`,
  });
  if (!document) return null;
  return { provider: 'openalex', format: 'tei', document };
}
