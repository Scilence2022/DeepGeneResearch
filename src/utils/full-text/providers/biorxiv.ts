import { fetchPublicBytes } from '@/utils/safe-public-fetch';
import { createPoliteFetcher, type PoliteFetcher } from '../http';
import { segmentPdfDocument } from '../segment/pdf';
import type { AcquiredContent } from '../types';

const BIORXIV_DETAILS_BASE = 'https://api.biorxiv.org/details';
const MAX_PDF_BYTES = 30 * 1024 * 1024;
const PDF_DOWNLOAD_TIMEOUT_MS = 45_000;

let fetcher: PoliteFetcher | null = null;

function biorxivFetcher(): PoliteFetcher {
  fetcher ??= createPoliteFetcher({ provider: 'biorxiv', requestsPerSecond: 3 });
  return fetcher;
}

function is404(error: unknown): boolean {
  return /\bHTTP 404\b/.test(error instanceof Error ? error.message : String(error));
}

export interface BioRxivWorkRef {
  doi: string;
  title?: string;
  version?: string;
  server: 'biorxiv' | 'medrxiv';
}

/**
 * resolve stage: DOI -> bioRxiv/medRxiv preprint record. The details API is
 * queried per server (bioRxiv first, medRxiv as fallback); the collection
 * lists every posted version oldest-first, so the LAST entry is the current
 * version. Returns null when neither server indexes the DOI.
 */
export async function resolveBioRxivWork(doi: string): Promise<BioRxivWorkRef | null> {
  const normalized = String(doi || '').trim();
  if (!normalized) return null;
  for (const server of ['biorxiv', 'medrxiv'] as const) {
    const url = `${BIORXIV_DETAILS_BASE}/${server}/${encodeURIComponent(normalized)}`;
    let payload: any;
    try {
      payload = await biorxivFetcher().fetchJson(url);
    } catch (error) {
      if (is404(error)) continue;
      throw error;
    }
    const collection = Array.isArray(payload?.collection) ? payload.collection : [];
    const latest = collection[collection.length - 1];
    if (!latest || typeof latest !== 'object') continue;
    return {
      doi: String(latest.doi || normalized),
      title: latest.title ? String(latest.title) : undefined,
      version: latest.version != null ? String(latest.version) : undefined,
      server,
    };
  }
  return null;
}

/**
 * acquire stage: DOI -> bioRxiv/medRxiv preprint PDF normalized into the
 * shared document model. Preprint PDFs follow a deterministic URL scheme, so
 * no scraping is needed; the payload is validated via the %PDF- magic bytes
 * before parsing. Any resolution/download/parse failure yields null.
 */
export async function acquireBioRxivPreprintPdf(doi: string): Promise<AcquiredContent | null> {
  const work = await resolveBioRxivWork(doi);
  if (!work) return null;
  const sourceUrl = `https://www.${work.server}.org/content/${work.doi}v${work.version ?? '1'}.full.pdf`;
  try {
    const { body } = await fetchPublicBytes(sourceUrl, {
      maxBytes: MAX_PDF_BYTES,
      timeoutMs: PDF_DOWNLOAD_TIMEOUT_MS,
    });
    if (body.length < 5 || body.subarray(0, 5).toString('latin1') !== '%PDF-') return null;
    const document = await segmentPdfDocument({
      bytes: new Uint8Array(body),
      name: `${work.doi.replace(/[^\w.-]+/g, '_')}.pdf`,
      origin: 'pdf',
      identifiers: { doi: work.doi },
      sourceUrl,
    });
    return { provider: 'biorxiv', format: 'pdf', document };
  } catch {
    return null;
  }
}
