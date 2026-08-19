import { createHash } from 'crypto';
import {
  FULL_TEXT_CANONICALIZATION,
  FULL_TEXT_OFFSET_ENCODING,
  canonicalizeFullText,
  type FullTextDocument,
} from '@/utils/gene-research/full-text';
import { createPoliteFetcher, type PoliteFetcher } from '../http';
import type { AcquiredContent } from '../types';

const ASTA_MCP_URL = 'https://asta-tools.allen.ai/mcp/v1';
const MCP_PROTOCOL_VERSION = '2025-03-26';

let fetcher: PoliteFetcher | null = null;

function astaFetcher(): PoliteFetcher {
  fetcher ??= createPoliteFetcher({ provider: 'asta', requestsPerSecond: 2 });
  return fetcher;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string;
  result?: any;
  error?: { code?: number; message?: string };
}

/** Parse an SSE frame stream and return the last JSON-RPC message carrying a result or error. */
function parseSseLastMessage(body: string): JsonRpcMessage | null {
  let last: JsonRpcMessage | null = null;
  for (const line of body.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    let message: JsonRpcMessage;
    try {
      message = JSON.parse(data);
    } catch {
      continue;
    }
    if (message && (message.result !== undefined || message.error !== undefined)) last = message;
  }
  return last;
}

async function postMcp(
  apiKey: string,
  body: Record<string, unknown>,
  sessionId?: string,
): Promise<{ message: JsonRpcMessage | null; sessionId?: string }> {
  const response = await astaFetcher().fetch(ASTA_MCP_URL, {
    init: {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(sessionId ? { 'mcp-session-id': sessionId } : {}),
      },
      body: JSON.stringify(body),
    },
  });
  const nextSessionId = response.headers.get('mcp-session-id') || sessionId;
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/event-stream')) {
    return { message: parseSseLastMessage(await response.text()), sessionId: nextSessionId };
  }
  // 202 Accepted is the MCP acknowledgement for notifications: no body.
  if (response.status === 202) return { message: null, sessionId: nextSessionId };
  const message = (await response.json()) as JsonRpcMessage;
  return { message, sessionId: nextSessionId };
}

/**
 * Call an Asta MCP tool. Asta speaks MCP-over-HTTP rather than REST: a
 * JSON-RPC tools/call POST that may answer either as plain JSON or as an
 * SSE-framed stream. When the server rejects a session-less call, run the
 * MCP initialize handshake once (reusing the mcp-session-id header) and
 * retry the call a single time.
 */
async function callAstaTool(apiKey: string, name: string, args: Record<string, unknown>): Promise<any> {
  const request = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } };
  let { message, sessionId } = await postMcp(apiKey, request);
  if (message?.error) {
    const initialized = await postMcp(apiKey, {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'deep-gene-research', version: '1.0' },
      },
    }, sessionId);
    sessionId = initialized.sessionId;
    if (initialized.message?.error) {
      throw new Error(`asta initialize failed: ${initialized.message.error.message || 'unknown error'}`);
    }
    await postMcp(apiKey, { jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId);
    ({ message } = await postMcp(apiKey, request, sessionId));
  }
  if (!message) throw new Error('asta returned no JSON-RPC response');
  if (message.error) {
    throw new Error(`asta tools/call ${name} failed: ${message.error.message || 'unknown error'}`);
  }
  return message.result;
}

/** Tool results arrive as content[] text items whose text is JSON; locate the snippet array defensively. */
function extractSnippetEntries(result: any): any[] {
  const content = Array.isArray(result?.content) ? result.content : [];
  const entries: any[] = [];
  for (const item of content) {
    if (item?.type !== 'text' || typeof item.text !== 'string') continue;
    let parsed: any;
    try {
      parsed = JSON.parse(item.text);
    } catch {
      continue;
    }
    const candidates = Array.isArray(parsed)
      ? parsed
      : [parsed?.snippets, parsed?.results, parsed?.data].find(Array.isArray) || [];
    for (const entry of candidates) {
      if (entry && typeof entry === 'object') entries.push(entry);
    }
  }
  return entries;
}

function snippetDocument(entry: any, passage: string): FullTextDocument {
  const paper = entry?.paper && typeof entry.paper === 'object' ? entry.paper : {};
  const title = String(entry?.title || paper?.title || '').trim();
  const doi = String(entry?.doi || paper?.doi || '').trim() || undefined;
  const pmid = String(entry?.pmid || paper?.pmid || '').trim() || undefined;
  const corpusId = entry?.corpus_id ?? entry?.corpusId ?? paper?.corpus_id ?? paper?.corpusId;
  const sourceUrl = corpusId != null && String(corpusId).trim()
    ? `https://www.semanticscholar.org/paper/${encodeURIComponent(String(corpusId).trim())}`
    : undefined;
  return {
    schema: 'dgr.full-text-document.v1',
    origin: 'snippet',
    name: title || 'asta-snippet',
    mediaType: 'text/plain',
    documentSha256: createHash('sha256').update(JSON.stringify(entry)).digest('hex'),
    text: passage,
    textSha256: createHash('sha256').update(passage).digest('hex'),
    textLength: passage.length,
    canonicalization: FULL_TEXT_CANONICALIZATION,
    offsetEncoding: FULL_TEXT_OFFSET_ENCODING,
    pageCount: null,
    parsedPageCount: null,
    parseCoverage: 1,
    pages: [],
    identifiers: {
      ...(pmid ? { pmid } : {}),
      ...(doi ? { doi } : {}),
    },
    ...(sourceUrl ? { sourceUrl } : {}),
    retrievedAt: new Date().toISOString(),
    parser: 'asta-snippet',
  };
}

/**
 * The Asta payload nests the passage: `entry.snippet` is an object shaped
 * `{ text, snippetKind, section, snippetOffset }`, not a plain string.
 * Accept the legacy string form and a top-level `text` field too.
 */
function snippetPassage(entry: any): string {
  const snippet = entry?.snippet;
  if (snippet && typeof snippet === 'object') return String(snippet.text || '');
  return String(snippet || entry?.text || '');
}

/**
 * resolve/extract hybrid: free-text query -> Ai2 Asta snippet_search
 * passages (~500 words each) from the Semantic Scholar corpus, each wrapped
 * as an AcquiredContent snippet document with paper provenance. Asta
 * requires an API key; without one (or on any tool error) the provider
 * abstains with [].
 */
export async function searchAstaSnippets(
  query: string,
  options: { apiKey?: string; limit?: number },
): Promise<AcquiredContent[]> {
  const apiKey = String(options?.apiKey || '').trim();
  const trimmed = String(query || '').trim();
  if (!apiKey || !trimmed) return [];
  let result: any;
  try {
    result = await callAstaTool(apiKey, 'snippet_search', { query: trimmed, limit: options?.limit ?? 5 });
  } catch {
    return [];
  }
  const contents: AcquiredContent[] = [];
  for (const entry of extractSnippetEntries(result)) {
    const passage = canonicalizeFullText(snippetPassage(entry));
    if (!passage) continue;
    contents.push({
      provider: 'asta',
      format: 'snippet',
      document: snippetDocument(entry, passage),
    });
  }
  return contents;
}
