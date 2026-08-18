import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPoliteFetcher } from './http';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createPoliteFetcher', () => {
  it('enforces the minimum interval between requests', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);
    const fetcher = createPoliteFetcher({ provider: 'test', requestsPerSecond: 50 });

    const startedAt = Date.now();
    await fetcher.fetchJson('https://example.test/a');
    await fetcher.fetchJson('https://example.test/b');
    const elapsed = Date.now() - startedAt;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 50 req/s => 20ms minimum interval between the two requests.
    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  it('retries retryable statuses and honors Retry-After', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const fetcher = createPoliteFetcher({ provider: 'test', requestsPerSecond: 1000 });

    const result = await fetcher.fetchJson<{ ok: boolean }>('https://example.test/a');
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable statuses and names the provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ detail: 'nope' }, 400));
    vi.stubGlobal('fetch', fetchMock);
    const fetcher = createPoliteFetcher({ provider: 'crossref', requestsPerSecond: 1000 });

    await expect(fetcher.fetchJson('https://example.test/a')).rejects.toThrow(/crossref returned HTTP 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends configured headers with every request', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ ok: true })));
    vi.stubGlobal('fetch', fetchMock);
    const fetcher = createPoliteFetcher({
      provider: 'core',
      requestsPerSecond: 1000,
      headers: { authorization: 'Bearer key-1' },
    });

    await fetcher.fetchJson('https://example.test/a');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer key-1');
  });

  it('wraps invalid JSON payloads in a provider-named error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('not json', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const fetcher = createPoliteFetcher({ provider: 'pubtator', requestsPerSecond: 1000 });

    await expect(fetcher.fetchJson('https://example.test/a')).rejects.toThrow(/pubtator returned invalid JSON/);
  });
});
