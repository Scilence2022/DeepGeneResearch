import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchCrossrefWorkMetadata } from './crossref';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubMessage(message: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ message })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('fetchCrossrefWorkMetadata', () => {
  it('prefers the version-of-record license', async () => {
    stubMessage({
      license: [
        { 'content-version': 'am', URL: 'https://example.test/am-license' },
        { 'content-version': 'vor', URL: 'https://example.test/vor-license' },
      ],
    });

    const metadata = await fetchCrossrefWorkMetadata('10.1000/xyz');
    expect(metadata).toEqual({ license: 'https://example.test/vor-license' });
  });

  it('extracts the text-mining link and the retraction signal', async () => {
    stubMessage({
      link: [
        { 'intended-application': 'similarity-checking', URL: 'https://example.test/other' },
        { 'intended-application': 'text-mining', URL: 'https://example.test/fulltext.pdf' },
      ],
      'update-to': [{ type: 'retraction', DOI: '10.1000/retraction' }],
    });

    const metadata = await fetchCrossrefWorkMetadata('10.1000/xyz');
    expect(metadata).toEqual({
      textMiningUrl: 'https://example.test/fulltext.pdf',
      isRetracted: true,
    });
  });

  it('returns null on 404', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response('not found', { status: 404 })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchCrossrefWorkMetadata('10.1000/missing')).resolves.toBeNull();
  });

  it('returns null when none of the tracked fields are present', async () => {
    stubMessage({ title: ['A paper with no license, link, or update relations'] });

    await expect(fetchCrossrefWorkMetadata('10.1000/xyz')).resolves.toBeNull();
  });

  it('encodes the DOI and appends the mailto param', async () => {
    const fetchMock = stubMessage({
      license: [{ 'content-version': 'vor', URL: 'https://example.test/vor-license' }],
    });

    await fetchCrossrefWorkMetadata('10.1000/abc def', { mailto: 'team@example.test' });

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe('https://api.crossref.org/works/10.1000%2Fabc%20def?mailto=team%40example.test');
  });
});
