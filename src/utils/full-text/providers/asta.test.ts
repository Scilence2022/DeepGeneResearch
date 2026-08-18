import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchAstaSnippets } from './asta';

const snippetEntries = [
  {
    snippet: 'The dapA gene encodes dihydrodipicolinate synthase in Escherichia coli.',
    paper: { title: 'dapA biochemistry', doi: '10.1000/xyz', pmid: '12345678', corpus_id: 998877 },
  },
  {
    text: 'Dihydrodipicolinate synthase catalyzes the committed step of lysine biosynthesis.',
    title: 'Lysine pathway review',
  },
];

const toolResult = {
  jsonrpc: '2.0',
  id: 1,
  result: {
    content: [{ type: 'text', text: JSON.stringify(snippetEntries) }],
  },
};

function sseResponse(messages: unknown[]): Response {
  const body = messages.map(message => `event: message\ndata: ${JSON.stringify(message)}\n\n`).join('');
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchAstaSnippets', () => {
  it('returns [] without an api key and never fetches', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchAstaSnippets('dapA function', { })).resolves.toEqual([]);
    await expect(searchAstaSnippets('dapA function', { apiKey: '  ' })).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('parses a plain JSON JSON-RPC response into snippet documents', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(toolResult), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const contents = await searchAstaSnippets('dapA function', { apiKey: 'asta-key', limit: 2 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://asta-tools.allen.ai/mcp/v1');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('asta-key');
    expect(headers.accept).toBe('application/json, text/event-stream');
    const rpc = JSON.parse(String(init?.body));
    expect(rpc.method).toBe('tools/call');
    expect(rpc.params).toEqual({ name: 'snippet_search', arguments: { query: 'dapA function', limit: 2 } });

    expect(contents).toHaveLength(2);
    const first = contents[0];
    expect(first.provider).toBe('asta');
    expect(first.format).toBe('snippet');
    expect(first.document.origin).toBe('snippet');
    expect(first.document.parser).toBe('asta-snippet');
    expect(first.document.name).toBe('dapA biochemistry');
    expect(first.document.text).toContain('dihydrodipicolinate synthase');
    expect(first.document.identifiers).toEqual({ pmid: '12345678', doi: '10.1000/xyz' });
    expect(first.document.sourceUrl).toBe('https://www.semanticscholar.org/paper/998877');
    expect(first.document.pageCount).toBeNull();
    expect(first.document.pages).toEqual([]);
    expect(first.document.parseCoverage).toBe(1);
    expect(first.document.textSha256).toMatch(/^[0-9a-f]{64}$/);

    // Second snippet carries only a title: no identifiers, no sourceUrl.
    expect(contents[1].document.identifiers).toEqual({});
    expect(contents[1].document.sourceUrl).toBeUndefined();
  });

  it('parses an SSE-framed JSON-RPC response', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(sseResponse([
        { jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 1 } },
        toolResult,
      ])),
    );
    vi.stubGlobal('fetch', fetchMock);

    const contents = await searchAstaSnippets('dapA function', { apiKey: 'asta-key' });

    expect(contents).toHaveLength(2);
    expect(contents[0].document.name).toBe('dapA biochemistry');
  });

  it('runs the MCP handshake and retries once when the direct call is rejected', async () => {
    const fetchMock = vi.fn()
      .mockImplementationOnce(() =>
        Promise.resolve(sseResponse([
          { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'session required' } },
        ])),
      )
      .mockImplementationOnce(() =>
        Promise.resolve(new Response(JSON.stringify({
          jsonrpc: '2.0',
          id: 0,
          result: { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'asta', version: '1' } },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json', 'mcp-session-id': 'session-1' },
        })),
      )
      .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 202 })))
      .mockImplementationOnce(() =>
        Promise.resolve(new Response(JSON.stringify(toolResult), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })),
      );
    vi.stubGlobal('fetch', fetchMock);

    const contents = await searchAstaSnippets('dapA function', { apiKey: 'asta-key' });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const methods = fetchMock.mock.calls.map(call => JSON.parse(String(call[1]?.body)).method);
    expect(methods).toEqual(['tools/call', 'initialize', 'notifications/initialized', 'tools/call']);
    // The retried call reuses the session id from the initialize response.
    const retryHeaders = fetchMock.mock.calls[3][1]?.headers as Record<string, string>;
    expect(retryHeaders['mcp-session-id']).toBe('session-1');
    expect(contents).toHaveLength(2);
  });

  it('returns [] when the tool call errors after the retry', async () => {
    const errorFrame = sseResponse([
      { jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'internal error' } },
    ]);
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => Promise.resolve(errorFrame))
      .mockImplementationOnce(() => Promise.resolve(sseResponse([{ jsonrpc: '2.0', id: 0, result: {} }])))
      .mockImplementationOnce(() => Promise.resolve(new Response(null, { status: 202 })))
      .mockImplementationOnce(() => Promise.resolve(sseResponse([
        { jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'internal error' } },
      ])));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchAstaSnippets('dapA function', { apiKey: 'asta-key' })).resolves.toEqual([]);
  });
});
