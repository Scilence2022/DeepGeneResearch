import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertPublicationIds } from './ncbi-idconv';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('convertPublicationIds', () => {
  it('maps records to CandidateWork and skips errmsg records', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({
        status: 'ok',
        records: [
          { pmid: '12345678', pmcid: 'PMC7096803', doi: '10.1016/j.example.2020.01' },
          { pmid: '87654321', pmcid: 'pmc1234567' },
          { requested_id: 'bogus', errmsg: 'invalid id' },
        ],
      })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const works = await convertPublicationIds(['12345678', '87654321', 'bogus']);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/pmc/utils/idconv/v1.0/?ids=12345678%2C87654321%2Cbogus&format=json');
    expect(url).not.toContain('api_key=');
    expect(works).toEqual([
      { pmid: '12345678', pmcid: 'PMC7096803', doi: '10.1016/j.example.2020.01' },
      { pmid: '87654321', pmcid: 'PMC1234567', doi: undefined },
    ]);
  });

  it('appends the api_key query param when a key is provided', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({ status: 'ok', records: [{ pmid: '12345678' }] })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await convertPublicationIds(['12345678'], { apiKey: 'secret-key' });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('api_key=secret-key');
  });

  it('chunks requests at 200 ids', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({ status: 'ok', records: [] })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const ids = Array.from({ length: 250 }, (_, i) => String(10000000 + i));
    await convertPublicationIds(ids);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstIds = new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('ids')!.split(',');
    const secondIds = new URL(String(fetchMock.mock.calls[1][0])).searchParams.get('ids')!.split(',');
    expect(firstIds).toHaveLength(200);
    expect(secondIds).toHaveLength(50);
    expect(firstIds[0]).toBe('10000000');
    expect(secondIds[0]).toBe('10000200');
  });

  it('returns [] for empty input without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(convertPublicationIds([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
