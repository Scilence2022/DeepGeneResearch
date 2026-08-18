import { afterEach, describe, expect, it, vi } from 'vitest';
import { locateUnpaywallOaCopy } from './unpaywall';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubPayload(payload: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(payload)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('locateUnpaywallOaCopy', () => {
  it('prefers best_oa_location.url_for_pdf and reports the repository landing page', async () => {
    stubPayload({
      is_oa: true,
      best_oa_location: {
        host_type: 'repository',
        url: 'https://repo.example.test/record/1',
        url_for_pdf: 'https://repo.example.test/record/1/paper.pdf',
      },
      oa_locations: [],
    });

    const metadata = await locateUnpaywallOaCopy('10.1000/xyz', { email: 'team@example.test' });
    expect(metadata).toEqual({
      oaPdfUrl: 'https://repo.example.test/record/1/paper.pdf',
      oaRepositoryUrl: 'https://repo.example.test/record/1',
    });
  });

  it('falls back to the first oa_locations pdf and omits publisher landing pages', async () => {
    stubPayload({
      is_oa: true,
      best_oa_location: { host_type: 'publisher', url: 'https://journal.example.test/article' },
      oa_locations: [
        { host_type: 'repository', url: 'https://repo.example.test/a' },
        { host_type: 'repository', url: 'https://repo.example.test/b', url_for_pdf: 'https://repo.example.test/b.pdf' },
      ],
    });

    const metadata = await locateUnpaywallOaCopy('10.1000/xyz', { email: 'team@example.test' });
    expect(metadata).toEqual({ oaPdfUrl: 'https://repo.example.test/b.pdf' });
  });

  it('returns null for non-OA works', async () => {
    stubPayload({ is_oa: false, best_oa_location: null, oa_locations: [] });

    await expect(locateUnpaywallOaCopy('10.1000/xyz', { email: 'team@example.test' })).resolves.toBeNull();
  });

  it('returns null without an email and never calls the API', async () => {
    const fetchMock = stubPayload({ is_oa: true });

    await expect(locateUnpaywallOaCopy('10.1000/xyz', {})).resolves.toBeNull();
    await expect(locateUnpaywallOaCopy('10.1000/xyz', { email: '  ' })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null on 404', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('not found', { status: 404 })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(locateUnpaywallOaCopy('10.1000/missing', { email: 'team@example.test' })).resolves.toBeNull();
  });

  it('encodes the DOI and sends the email query param', async () => {
    const fetchMock = stubPayload({ is_oa: false, oa_locations: [] });

    await locateUnpaywallOaCopy('10.1000/abc def', { email: 'team@example.test' });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe('https://api.unpaywall.org/v2/10.1000%2Fabc%20def?email=team%40example.test');
  });
});
