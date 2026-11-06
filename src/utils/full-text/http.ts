import { setTimeout as delay } from 'node:timers/promises';
import { fetchResearchProvider, ResearchBudgetExceededError, researchBudget } from '@/services/research-run-budget';
import { createFetchSignal } from '@/utils/fetch-signal';

/**
 * Generic per-provider polite fetcher for the full-text acquisition layer.
 * Generalizes the NCBI limiter pattern from gene-research/search-providers.ts
 * (minimum interval, Retry-After, exponential backoff, abortable delays) into
 * a reusable per-provider instance. Each provider client creates its own
 * limiter so politeness windows are enforced per upstream host.
 */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function abortableDelay(delayMs: number, signal?: AbortSignal) {
  if (delayMs > 0) await delay(delayMs, undefined, { signal });
  signal?.throwIfAborted();
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, date - Date.now());
}

export interface PoliteFetcherOptions {
  /** Provider name used in error messages and attempt logging. */
  provider: string;
  /** Sustained request rate enforced via a serialized queue. Default 3/s. */
  requestsPerSecond?: number;
  /** Total attempts per request including the first. Default 3. */
  maxAttempts?: number;
  /** Per-attempt timeout passed to createFetchSignal. Default 30s. */
  timeoutMs?: number;
  /** Extra headers sent with every request (e.g. authorization). */
  headers?: Record<string, string>;
}

export interface PoliteFetchOptions {
  signal?: AbortSignal;
  init?: RequestInit;
  maxAttempts?: number;
}

export interface PoliteFetcher {
  fetch: (url: string, options?: PoliteFetchOptions) => Promise<Response>;
  fetchJson: <T = any>(url: string, options?: PoliteFetchOptions) => Promise<T>;
  fetchText: (url: string, options?: PoliteFetchOptions) => Promise<string>;
}

export function createPoliteFetcher({
  provider,
  requestsPerSecond = 3,
  maxAttempts = 3,
  timeoutMs = 30_000,
  headers = {},
}: PoliteFetcherOptions): PoliteFetcher {
  const minimumIntervalMs = Math.max(1, Math.ceil(1_000 / requestsPerSecond));
  let queue: Promise<void> = Promise.resolve();
  let lastRequestAt = 0;

  async function waitForSlot(signal?: AbortSignal): Promise<void> {
    const scheduled = queue.then(async () => {
      signal?.throwIfAborted();
      const waitMs = Math.max(0, minimumIntervalMs - (Date.now() - lastRequestAt));
      await abortableDelay(waitMs, signal);
      signal?.throwIfAborted();
      lastRequestAt = Date.now();
    });
    queue = scheduled.catch(() => undefined);
    return scheduled;
  }

  async function requireOk(response: Response): Promise<Response> {
    if (response.ok) return response;
    void response.body?.cancel().catch(() => undefined);
    throw new Error(`${provider} returned HTTP ${response.status}`);
  }

  async function politeFetch(url: string, options: PoliteFetchOptions = {}): Promise<Response> {
    const { signal, init, maxAttempts: attempts = maxAttempts } = options;
    let lastResponse: Response | null = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      signal?.throwIfAborted();
      await waitForSlot(signal);
      let response: Response;
      try {
        response = await fetchResearchProvider(url, {
          ...init,
          headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
          signal: createFetchSignal(signal, timeoutMs),
        }, provider, attempt);
      } catch (error) {
        signal?.throwIfAborted();
        if (error instanceof ResearchBudgetExceededError || attempt === attempts) throw error;
        await abortableDelay(Math.min(2_000, 250 * (2 ** (attempt - 1))), signal);
        continue;
      }
      if (response.ok) return response;
      lastResponse = response;
      if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts) {
        return requireOk(response);
      }
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      if (retryAfterMs !== null && retryAfterMs > 10_000) return requireOk(response);
      const backoffMs = retryAfterMs ?? Math.min(2_000, 250 * (2 ** (attempt - 1)));
      void response.body?.cancel().catch(() => undefined);
      await abortableDelay(backoffMs, signal);
    }
    return requireOk(lastResponse!);
  }

  return {
    fetch: politeFetch,
    async fetchJson<T = any>(url: string, options: PoliteFetchOptions = {}): Promise<T> {
      const response = await politeFetch(url, options);
      const text = await readProviderText(response);
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`${provider} returned invalid JSON`);
      }
    },
    async fetchText(url: string, options: PoliteFetchOptions = {}): Promise<string> {
      const response = await politeFetch(url, options);
      return readProviderText(response);
    },
  };
}

export async function readProviderText(response: Response, maxBytes = 16 * 1024 * 1024): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      try {
        researchBudget()?.charge('downloadedBytes', value.byteLength);
      } catch (error) {
        void reader.cancel().catch(() => undefined);
        throw error;
      }
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new Error('Provider response exceeds the size limit');
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
