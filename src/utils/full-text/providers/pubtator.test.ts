import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquirePubtatorBioc, searchPubtatorGeneAutocomplete } from './pubtator';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const passageText = 'The dapA gene encodes dihydrodipicolinate synthase in Escherichia coli. '.repeat(5);

const biocFixture = [
  {
    id: '12345678',
    passages: [
      {
        infons: { section_type: 'ABSTRACT', type: 'abstract' },
        text: passageText,
        annotations: [
          {
            text: 'dapA',
            infons: { type: 'Gene', identifier: '938036' },
            locations: [{ offset: 4, length: 4 }],
          },
        ],
      },
    ],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('acquirePubtatorBioc', () => {
  it('returns AcquiredContent with provider annotations for a biocjson payload', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(biocFixture)));
    vi.stubGlobal('fetch', fetchMock);

    const content = await acquirePubtatorBioc('12345678');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/research/pubtator3-api/publications/export/biocjson?pmids=12345678&full=true');
    expect(url).not.toContain('api_key=');

    expect(content).not.toBeNull();
    expect(content!.provider).toBe('pubtator');
    expect(content!.format).toBe('bioc');
    expect(content!.document.origin).toBe('bioc');
    expect(content!.document.parser).toBe('pubtator-bioc');
    expect(content!.document.identifiers.pmid).toBe('12345678');
    expect(content!.providerAnnotations).toEqual([
      { type: 'Gene', identifier: '938036', mention: 'dapA', start: -1, end: -1 },
    ]);
  });

  it('appends the api_key query param when an NCBI key is present', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(biocFixture)));
    vi.stubGlobal('fetch', fetchMock);

    await acquirePubtatorBioc('12345678', { ncbiApiKey: 'secret-key' });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('api_key=secret-key');
  });

  it('returns null on 404 and on payloads without usable text', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(new Response('not found', { status: 404 })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse([{ passages: [] }])));
    vi.stubGlobal('fetch', fetchMock);

    await expect(acquirePubtatorBioc('12345678')).resolves.toBeNull();
    await expect(acquirePubtatorBioc('12345678')).resolves.toBeNull();
  });

  it('omits providerAnnotations when the payload has none', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse([{ passages: [{ infons: {}, text: passageText, annotations: [] }] }])),
    );
    vi.stubGlobal('fetch', fetchMock);

    const content = await acquirePubtatorBioc('12345678');
    expect(content).not.toBeNull();
    expect(content!.providerAnnotations).toBeUndefined();
  });
});

describe('searchPubtatorGeneAutocomplete', () => {
  it('maps autocomplete entries to NCBI Gene IDs', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse([
        { _id: 'x', id: '938036', name: 'dapA', description: 'dihydrodipicolinate synthase' },
        { _id: 'y', id: '947742', name: 'lysC' },
      ])),
    );
    vi.stubGlobal('fetch', fetchMock);

    const results = await searchPubtatorGeneAutocomplete('dapA');

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/research/pubtator3-api/entity/autocomplete/?query=dapA&concept=gene');
    expect(results).toEqual([
      { id: '938036', name: 'dapA' },
      { id: '947742', name: 'lysC' },
    ]);
  });

  it('returns [] on non-OK responses and empty payloads', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(new Response('nope', { status: 500 })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse([])));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchPubtatorGeneAutocomplete('dapA')).resolves.toEqual([]);
    await expect(searchPubtatorGeneAutocomplete('dapA')).resolves.toEqual([]);
  });
});
