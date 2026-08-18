import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverCoreFullText } from './core';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('discoverCoreFullText', () => {
  it('maps the discover payload to oaPdfUrl and oaRepositoryUrl', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({
        doi: '10.1000/xyz',
        fullTextLink: 'https://core.ac.uk/download/123456.pdf',
        links: [{ url: 'https://core.ac.uk/works/123456' }],
      })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const metadata = await discoverCoreFullText('10.1000/xyz', { apiKey: 'core-key' });

    expect(metadata).toEqual({
      oaPdfUrl: 'https://core.ac.uk/download/123456.pdf',
      oaRepositoryUrl: 'https://core.ac.uk/works/123456',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.core.ac.uk/v3/discover');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ doi: '10.1000/xyz' });
  });

  it('sends the bearer token and accepts downloadUrl / links[] fallbacks', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({
        downloadUrl: 'https://repo.example.test/download/42',
        links: ['not-a-url', { url: 'ftp://ignored.example.test/x' }],
      })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const metadata = await discoverCoreFullText('10.1000/xyz', { apiKey: 'core-key' });

    expect(metadata).toEqual({ oaPdfUrl: 'https://repo.example.test/download/42' });
    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer core-key');
    expect(headers['content-type']).toBe('application/json');
  });

  it('omits the authorization header without a key', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(jsonResponse({ downloadUrl: 'https://repo.example.test/download/42' })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await discoverCoreFullText('10.1000/xyz');

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
  });

  it('returns null when the payload has no usable link and on 404', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(jsonResponse({ doi: '10.1000/xyz', links: [] })))
      .mockImplementationOnce(() => Promise.resolve(new Response('not found', { status: 404 })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(discoverCoreFullText('10.1000/xyz', { apiKey: 'core-key' })).resolves.toBeNull();
    await expect(discoverCoreFullText('10.1000/missing', { apiKey: 'core-key' })).resolves.toBeNull();
  });
});
