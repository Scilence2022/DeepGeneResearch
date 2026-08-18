import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicBytes } from '@/utils/safe-public-fetch';
import { segmentPdfDocument } from '../segment/pdf';
import { acquireBioRxivPreprintPdf, resolveBioRxivWork } from './biorxiv';

vi.mock('@/utils/safe-public-fetch', () => ({
  fetchPublicBytes: vi.fn(),
}));

vi.mock('../segment/pdf', () => ({
  segmentPdfDocument: vi.fn(),
}));

const fetchPublicBytesMock = vi.mocked(fetchPublicBytes);
const segmentPdfDocumentMock = vi.mocked(segmentPdfDocument);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const detailsPayload = {
  collection: [
    { doi: '10.1101/2020.01.01.123456', title: 'dapA preprint', version: '1' },
    { doi: '10.1101/2020.01.01.123456', title: 'dapA preprint v2', version: '2' },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  fetchPublicBytesMock.mockReset();
  segmentPdfDocumentMock.mockReset();
});

describe('resolveBioRxivWork', () => {
  it('takes the last collection entry as the current version', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(detailsPayload)));
    vi.stubGlobal('fetch', fetchMock);

    const work = await resolveBioRxivWork('10.1101/2020.01.01.123456');

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.biorxiv.org/details/biorxiv/10.1101%2F2020.01.01.123456',
    );
    expect(work).toEqual({
      doi: '10.1101/2020.01.01.123456',
      title: 'dapA preprint v2',
      version: '2',
      server: 'biorxiv',
    });
  });

  it('falls back to medrxiv when biorxiv has no record', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/details/biorxiv/')) {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }
      return Promise.resolve(jsonResponse({
        collection: [{ doi: '10.1101/2020.01.01.123456', title: 'medrxiv version', version: '3' }],
      }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const work = await resolveBioRxivWork('10.1101/2020.01.01.123456');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('/details/medrxiv/');
    expect(work).toEqual({
      doi: '10.1101/2020.01.01.123456',
      title: 'medrxiv version',
      version: '3',
      server: 'medrxiv',
    });
  });

  it('returns null when neither server indexes the doi', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ collection: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(resolveBioRxivWork('10.1101/2020.01.01.123456')).resolves.toBeNull();
  });
});

describe('acquireBioRxivPreprintPdf', () => {
  const fakeDocument = { schema: 'dgr.full-text-document.v1', origin: 'pdf' };

  it('downloads the versioned PDF URL and segments it', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(detailsPayload)));
    vi.stubGlobal('fetch', fetchMock);
    fetchPublicBytesMock.mockResolvedValue({
      url: new URL('https://www.biorxiv.org/content/10.1101/2020.01.01.123456v2.full.pdf'),
      status: 200,
      contentType: 'application/pdf',
      body: Buffer.from('%PDF-1.7 fake pdf bytes'),
    });
    segmentPdfDocumentMock.mockResolvedValue(fakeDocument as any);

    const content = await acquireBioRxivPreprintPdf('10.1101/2020.01.01.123456');

    expect(fetchPublicBytesMock).toHaveBeenCalledWith(
      'https://www.biorxiv.org/content/10.1101/2020.01.01.123456v2.full.pdf',
      { maxBytes: 30 * 1024 * 1024, timeoutMs: 45_000 },
    );
    const segmentInput = segmentPdfDocumentMock.mock.calls[0][0];
    expect(segmentInput.origin).toBe('pdf');
    expect(segmentInput.identifiers).toEqual({ doi: '10.1101/2020.01.01.123456' });
    expect(segmentInput.sourceUrl).toBe('https://www.biorxiv.org/content/10.1101/2020.01.01.123456v2.full.pdf');
    expect(content).toEqual({ provider: 'biorxiv', format: 'pdf', document: fakeDocument });
  });

  it('rejects payloads without the %PDF- magic bytes', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(detailsPayload)));
    vi.stubGlobal('fetch', fetchMock);
    fetchPublicBytesMock.mockResolvedValue({
      url: new URL('https://www.biorxiv.org/content/10.1101/2020.01.01.123456v2.full.pdf'),
      status: 200,
      contentType: 'application/octet-stream',
      body: Buffer.from('<html>not a pdf</html>'),
    });

    await expect(acquireBioRxivPreprintPdf('10.1101/2020.01.01.123456')).resolves.toBeNull();
    expect(segmentPdfDocumentMock).not.toHaveBeenCalled();
  });

  it('returns null when the preprint or the download is missing', async () => {
    const fetchMock = vi.fn()
      // First call: neither server has the DOI.
      .mockImplementationOnce(() => Promise.resolve(new Response('not found', { status: 404 })))
      .mockImplementationOnce(() => Promise.resolve(new Response('not found', { status: 404 })))
      // Second call: resolve succeeds, download 404s.
      .mockImplementationOnce(() => Promise.resolve(jsonResponse(detailsPayload)));
    vi.stubGlobal('fetch', fetchMock);
    fetchPublicBytesMock.mockRejectedValue(new Error('Crawler upstream returned 404'));

    await expect(acquireBioRxivPreprintPdf('10.1101/2020.01.01.123456')).resolves.toBeNull();
    await expect(acquireBioRxivPreprintPdf('10.1101/2020.01.01.123456')).resolves.toBeNull();
  });
});
