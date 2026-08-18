import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquireBiocPmcFullText } from './bioc-pmc';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const passageText = 'The dapA gene encodes dihydrodipicolinate synthase in Escherichia coli. '.repeat(5);

const biocFixture = [
  {
    id: 'PMC7096803',
    passages: [
      {
        infons: { section_type: 'TITLE', type: 'title' },
        text: passageText,
        annotations: [],
      },
      {
        infons: { section_type: 'ABSTRACT', type: 'abstract' },
        text: passageText,
        annotations: [],
      },
    ],
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('acquireBiocPmcFullText', () => {
  it('returns AcquiredContent for a BioC JSON payload', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(biocFixture)));
    vi.stubGlobal('fetch', fetchMock);

    const content = await acquireBiocPmcFullText('PMC7096803');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/research/bionlp/RESTful/pmcoa.cgi/BioC_json/7096803/unicode');

    expect(content).not.toBeNull();
    expect(content!.provider).toBe('bioc_pmc');
    expect(content!.format).toBe('bioc');
    expect(content!.document.origin).toBe('bioc');
    expect(content!.document.identifiers.pmcid).toBe('PMC7096803');
    expect(content!.providerAnnotations).toBeUndefined();
  });

  it('accepts a bare numeric id and normalizes the pmcid', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(biocFixture)));
    vi.stubGlobal('fetch', fetchMock);

    const content = await acquireBiocPmcFullText('7096803');

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/BioC_json/7096803/unicode');
    expect(content).not.toBeNull();
    expect(content!.document.identifiers.pmcid).toBe('PMC7096803');
  });

  it('returns null on 404 and on payloads without usable text', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(new Response('not found', { status: 404 })))
      .mockImplementationOnce(() => Promise.resolve(jsonResponse([{ passages: [] }])));
    vi.stubGlobal('fetch', fetchMock);

    await expect(acquireBiocPmcFullText('PMC7096803')).resolves.toBeNull();
    await expect(acquireBiocPmcFullText('PMC7096803')).resolves.toBeNull();
  });

  it('returns null for invalid pmcids without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(acquireBiocPmcFullText('not-a-pmcid')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
