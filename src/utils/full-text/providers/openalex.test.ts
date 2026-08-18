import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireOpenAlexTei, resolveOpenAlexWork } from './openalex';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const teiParagraph =
  'The dapA gene encodes dihydrodipicolinate synthase, which catalyzes the committed step of ' +
  'lysine biosynthesis in Escherichia coli. ';
const teiXml =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>' +
  `<p>${teiParagraph.repeat(12)}</p>` +
  '</body></text></TEI>';

const workPayload = {
  id: 'https://openalex.org/W123',
  doi: 'https://doi.org/10.1000/xyz',
  title: 'A dapA study',
  open_access: { is_oa: true, oa_status: 'gold', oa_url: 'https://journal.example.test/oa' },
  best_oa_location: { pdf_url: 'https://publisher.example.test/paper.pdf' },
  has_content: { grobid_xml: true, pdf: true },
  content_urls: {
    grobid_xml: 'https://content.openalex.org/works/W123.grobid-xml',
    pdf: 'https://content.openalex.org/works/W123.pdf',
  },
};

function stubOpenAlex(workStatus = 200, contentStatus = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (String(url).startsWith('https://content.openalex.org/')) {
      return Promise.resolve(
        contentStatus === 200
          ? new Response(teiXml, { status: 200, headers: { 'content-type': 'application/xml' } })
          : new Response('denied', { status: contentStatus }),
      );
    }
    return Promise.resolve(
      workStatus === 200 ? jsonResponse(workPayload) : new Response('not found', { status: workStatus }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveOpenAlexWork', () => {
  it('maps content_urls and the OA pdf location', async () => {
    const fetchMock = stubOpenAlex();

    const work = await resolveOpenAlexWork('10.1000/xyz');

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('https://api.openalex.org/works/doi:10.1000%2Fxyz?select=');
    expect(url).toContain('content_urls');
    expect(work).toEqual({
      openalexId: 'https://openalex.org/W123',
      title: 'A dapA study',
      grobidXmlUrl: 'https://content.openalex.org/works/W123.grobid-xml',
      pdfContentUrl: 'https://content.openalex.org/works/W123.pdf',
      oaPdfUrl: 'https://publisher.example.test/paper.pdf',
    });
  });

  it('falls back to open_access.oa_url when best_oa_location has no pdf', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({
        ...workPayload,
        best_oa_location: null,
      })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const work = await resolveOpenAlexWork('10.1000/xyz');
    expect(work!.oaPdfUrl).toBe('https://journal.example.test/oa');
  });

  it('returns null on 404', async () => {
    stubOpenAlex(404);
    await expect(resolveOpenAlexWork('10.1000/missing')).resolves.toBeNull();
  });
});

describe('acquireOpenAlexTei', () => {
  it('downloads the GROBID TEI with the api key and segments it', async () => {
    const fetchMock = stubOpenAlex();

    const content = await acquireOpenAlexTei('10.1000/xyz', { apiKey: 'secret-key' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const contentUrl = String(fetchMock.mock.calls[1][0]);
    expect(contentUrl).toBe('https://content.openalex.org/works/W123.grobid-xml?api_key=secret-key');

    expect(content).not.toBeNull();
    expect(content!.provider).toBe('openalex');
    expect(content!.format).toBe('tei');
    expect(content!.document.origin).toBe('tei');
    expect(content!.document.parser).toBe('openalex-grobid-tei');
    expect(content!.document.name).toBe('W123.tei.xml');
    expect(content!.document.sourceUrl).toBe(contentUrl);
    expect(content!.document.identifiers.doi).toBe('10.1000/xyz');
    expect(content!.document.text).toContain('dihydrodipicolinate synthase');
  });

  it('returns null when the content host answers 401', async () => {
    stubOpenAlex(200, 401);
    await expect(acquireOpenAlexTei('10.1000/xyz', { apiKey: 'bad-key' })).resolves.toBeNull();
  });

  it('returns null without an api key and never fetches', async () => {
    const fetchMock = stubOpenAlex();

    await expect(acquireOpenAlexTei('10.1000/xyz', {})).resolves.toBeNull();
    await expect(acquireOpenAlexTei('10.1000/xyz', { apiKey: '  ' })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stops requesting the content host once the daily cap is spent', async () => {
    vi.resetModules();
    const fresh = await import('./openalex');
    const fetchMock = stubOpenAlex();

    const first = await fresh.acquireOpenAlexTei('10.1000/xyz', { apiKey: 'k', maxDownloadsPerDay: 1 });
    expect(first).not.toBeNull();
    const contentCallsAfterFirst = fetchMock.mock.calls.filter(call =>
      String(call[0]).startsWith('https://content.openalex.org/'),
    ).length;
    expect(contentCallsAfterFirst).toBe(1);

    const second = await fresh.acquireOpenAlexTei('10.1000/xyz', { apiKey: 'k', maxDownloadsPerDay: 1 });
    expect(second).toBeNull();
    const contentCallsAfterSecond = fetchMock.mock.calls.filter(call =>
      String(call[0]).startsWith('https://content.openalex.org/'),
    ).length;
    expect(contentCallsAfterSecond).toBe(1);
  });
});
