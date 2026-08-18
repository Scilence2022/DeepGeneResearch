import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchSemanticScholarEnrichment } from './semanticscholar';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const s2Fixture = {
  paperId: 'abcdef',
  title: 'Dihydrodipicolinate synthase in Escherichia coli',
  tldr: { model: 'allenai/tldr', text: 'dapA encodes a key lysine biosynthesis enzyme.' },
  citationCount: 42,
  openAccessPdf: { url: 'https://example.org/paper.pdf', status: 'OA' },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchSemanticScholarEnrichment', () => {
  it('maps title, tldr text, citation count, and OA pdf url', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(s2Fixture)));
    vi.stubGlobal('fetch', fetchMock);

    const enrichment = await fetchSemanticScholarEnrichment('10.1016/j.example.2020.01');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('api.semanticscholar.org/graph/v1/paper/DOI:10.1016%2Fj.example.2020.01');
    expect(url).toContain('fields=title,tldr,citationCount,openAccessPdf');
    expect(enrichment).toEqual({
      title: 'Dihydrodipicolinate synthase in Escherichia coli',
      tldr: 'dapA encodes a key lysine biosynthesis enzyme.',
      citationCount: 42,
      oaPdfUrl: 'https://example.org/paper.pdf',
    });
  });

  it('returns null on 404', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('Paper not found', { status: 404 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSemanticScholarEnrichment('10.0000/nonexistent')).resolves.toBeNull();
  });

  it('omits missing fields and null tldr', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({ title: 'Some title', tldr: null, citationCount: 0, openAccessPdf: null })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const enrichment = await fetchSemanticScholarEnrichment('10.1016/j.example.2020.02');

    expect(enrichment).toEqual({
      title: 'Some title',
      tldr: undefined,
      citationCount: 0,
      oaPdfUrl: undefined,
    });
  });

  it('returns null for empty input without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchSemanticScholarEnrichment('  ')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
