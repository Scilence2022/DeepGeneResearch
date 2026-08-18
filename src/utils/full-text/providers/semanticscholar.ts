import { createPoliteFetcher, type PoliteFetcher } from '../http';

const S2_GRAPH_BASE = 'https://api.semanticscholar.org/graph/v1';

// Module-level lazy fetcher so the 1 req/s unauthenticated-tier limit is
// enforced across calls.
let fetcher: PoliteFetcher | null = null;

function semanticScholarFetcher(): PoliteFetcher {
  fetcher ??= createPoliteFetcher({ provider: 'semantic_scholar', requestsPerSecond: 1 });
  return fetcher;
}

function is404(error: unknown): boolean {
  return /404\b/.test(error instanceof Error ? error.message : String(error));
}

export interface SemanticScholarEnrichment {
  title?: string;
  tldr?: string;
  citationCount?: number;
  oaPdfUrl?: string;
}

/**
 * LICENSING WARNING: parts of the Semantic Scholar dataset are CC BY-NC,
 * redistribution of corpus data is prohibited, and Ai2 may terminate API
 * access at any time. DGR uses the Graph API ONLY for transient per-work
 * metadata enrichment (title / TLDR / citation count / OA PDF location); the
 * returned values must never be persisted into or redistributed as corpus
 * data.
 *
 * metadata helper: DOI -> Semantic Scholar Graph API enrichment. A 404 means
 * S2 does not index the DOI, which is the normal "absent" outcome.
 */
export async function fetchSemanticScholarEnrichment(
  doi: string,
): Promise<SemanticScholarEnrichment | null> {
  const normalized = String(doi || '').trim();
  if (!normalized) return null;
  const url = `${S2_GRAPH_BASE}/paper/DOI:${encodeURIComponent(normalized)}?fields=title,tldr,citationCount,openAccessPdf`;
  let payload: {
    title?: string;
    tldr?: { text?: string };
    citationCount?: number;
    openAccessPdf?: { url?: string };
  };
  try {
    payload = await semanticScholarFetcher().fetchJson(url);
  } catch (error) {
    if (is404(error)) return null;
    throw error;
  }
  return {
    title: payload?.title ? String(payload.title) : undefined,
    tldr: payload?.tldr?.text ? String(payload.tldr.text) : undefined,
    citationCount: Number.isFinite(payload?.citationCount) ? Number(payload.citationCount) : undefined,
    oaPdfUrl: payload?.openAccessPdf?.url ? String(payload.openAccessPdf.url) : undefined,
  };
}
