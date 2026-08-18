import { createPoliteFetcher, type PoliteFetcher } from '../http';

const ARXIV_API_BASE = 'https://export.arxiv.org/api/query';

// Module-level lazy fetcher so arXiv's stated courtesy limit of one request
// per 3 seconds is enforced across calls.
let fetcher: PoliteFetcher | null = null;

function arxivFetcher(): PoliteFetcher {
  fetcher ??= createPoliteFetcher({ provider: 'arxiv', requestsPerSecond: 1 / 3 });
  return fetcher;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, '\'')
    .replace(/&amp;/g, '&');
}

function extractTag(xml: string, tag: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  const value = match?.[1]?.replace(/\s+/g, ' ').trim();
  return value ? decodeXmlEntities(value) : undefined;
}

export interface ArxivWork {
  arxivId: string;
  title?: string;
  summary?: string;
  pdfUrl?: string;
  doi?: string;
}

/**
 * resolve stage: arXiv id or free-text query -> arXiv Atom entry (bio
 * q-bio/quantitative biology preprints). The feed is small Atom XML parsed
 * with regex since this repo carries no XML library. `arxivId` is the base id
 * with the version suffix stripped; `pdfUrl` keeps the versioned href.
 * Returns null when the feed contains no `<entry>`.
 */
export async function resolveArxivWork(
  idOrQuery: string,
  options?: { isId?: boolean },
): Promise<ArxivWork | null> {
  const trimmed = String(idOrQuery || '').trim();
  if (!trimmed) return null;
  const url = options?.isId
    ? `${ARXIV_API_BASE}?id_list=${encodeURIComponent(trimmed)}`
    : `${ARXIV_API_BASE}?search_query=all:${encodeURIComponent(trimmed)}&max_results=1`;
  const xml = await arxivFetcher().fetchText(url);
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  const entry = entryMatch?.[1];
  if (!entry) return null;
  const entryId = extractTag(entry, 'id');
  if (!entryId) return null;
  const arxivId = entryId.replace(/^https?:\/\/arxiv\.org\/abs\//i, '').replace(/v\d+$/i, '');
  if (!arxivId) return null;
  const pdfMatch = entry.match(/<link\b[^>]*\btitle="pdf"[^>]*\bhref="([^"]+)"/i);
  return {
    arxivId,
    title: extractTag(entry, 'title'),
    summary: extractTag(entry, 'summary'),
    doi: extractTag(entry, 'arxiv:doi'),
    ...(pdfMatch?.[1] ? { pdfUrl: pdfMatch[1] } : {}),
  };
}
