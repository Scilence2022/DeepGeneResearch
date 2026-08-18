import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveArxivWork } from './arxiv';

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/atom+xml' },
  });
}

const entryXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <link href="https://export.arxiv.org/api/query" rel="self" type="application/atom+xml"/>
  <title type="html">ArXiv Query</title>
  <entry>
    <id>http://arxiv.org/abs/2301.12345v2</id>
    <updated>2023-02-01T00:00:00Z</updated>
    <published>2023-01-30T00:00:00Z</published>
    <title>  A quantitative biology study of
      dapA in E. coli  </title>
    <summary>  We present a study of dihydrodipicolinate synthase.
      It uses q-bio methods.  </summary>
    <link title="pdf" href="http://arxiv.org/pdf/2301.12345v2" rel="related" type="application/pdf"/>
    <arxiv:doi>10.1234/qbio.2023.001</arxiv:doi>
  </entry>
</feed>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveArxivWork', () => {
  it('parses entry title, summary, doi, and pdf link from an id lookup', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(textResponse(entryXml)));
    vi.stubGlobal('fetch', fetchMock);

    const work = await resolveArxivWork('2301.12345', { isId: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('export.arxiv.org/api/query?id_list=2301.12345');
    expect(work).toEqual({
      arxivId: '2301.12345',
      title: 'A quantitative biology study of dapA in E. coli',
      summary: 'We present a study of dihydrodipicolinate synthase. It uses q-bio methods.',
      pdfUrl: 'http://arxiv.org/pdf/2301.12345v2',
      doi: '10.1234/qbio.2023.001',
    });
  });

  it('uses search_query with max_results=1 for free-text queries', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(textResponse(entryXml)));
    vi.stubGlobal('fetch', fetchMock);

    const work = await resolveArxivWork('dapA quantitative biology');

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('search_query=all:dapA%20quantitative%20biology');
    expect(url).toContain('max_results=1');
    expect(work).not.toBeNull();
    expect(work!.arxivId).toBe('2301.12345');
  });

  it('returns null for an empty feed', async () => {
    const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title type="html">ArXiv Query</title></feed>`;
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(textResponse(emptyFeed)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveArxivWork('9999.99999', { isId: true })).resolves.toBeNull();
  });
});
