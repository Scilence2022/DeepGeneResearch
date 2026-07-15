import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSearchProvider } from './search';

describe('SearxNG research search', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('forwards academic scope and preserves relevant scientific results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{
        title: 'Functional group characterization of homoserine kinase from Escherichia coli',
        url: 'https://pubmed.ncbi.nlm.nih.gov/8660667/',
        content: 'Experimental characterization of the thrB gene product.',
        score: 12,
        engine: 'pubmed',
        engines: ['pubmed'],
        category: 'science',
      }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createSearchProvider({
      provider: 'searxng',
      baseURL: 'http://searx.test',
      query: 'thrB molecular function Escherichia coli',
      scope: 'academic',
      maxResult: 5,
    });

    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('q')).toBe('thrB molecular function Escherichia coli');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('categories')).toContain('science');
    expect(url.searchParams.get('engines')).toContain('pubmed');
    expect(result.sources).toEqual([expect.objectContaining({
      url: 'https://pubmed.ncbi.nlm.nih.gov/8660667/',
    })]);
  });

  it('rejects upstream errors instead of silently returning an empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('service unavailable', { status: 503 })));
    await expect(createSearchProvider({
      provider: 'searxng', baseURL: 'http://searx.test', query: 'thrB', scope: 'academic',
    })).rejects.toThrow('SearxNG returned HTTP 503');
  });
});
