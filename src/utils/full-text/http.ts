import { createFetchSignal } from '@/utils/fetch-signal';

/**
 * Generic per-provider polite fetcher for the full-text acquisition layer.
 * Generalizes the NCBI limiter pattern from gene-research/search-providers.ts
 * (minimum interval, Retry-After, exponential backoff, abortable delays) into
 * a reusable per-provider instance. Each provider client creates its own
 * limiter so politeness windows are enforced per upstream host.
 */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function abortableDelay(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (delayMs <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason || new Error('Request aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 10_000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.min(Math.max(0, date - Date.now()), 10_000);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    const body = (await response.text()).replace(/\s+/g, ' ').slice(0, 300);
    throw new Error(`${provider} returned HTTP ${response.status}${body ? `: ${body}` : ''}`);
  }

  async function politeFetch(url: string, options: PoliteFetchOptions = {}): Promise<Response> {
    const { signal, init, maxAttempts: attempts = maxAttempts } = options;
    let lastResponse: Response | null = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      signal?.throwIfAborted();
      await waitForSlot(signal);
      let response: Response;
      try {
        response = await fetch(url, {
          ...init,
          headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
          signal: createFetchSignal(signal, timeoutMs),
        });
      } catch (error) {
        signal?.throwIfAborted();
        if (attempt === attempts) throw error;
        await abortableDelay(Math.min(2_000, 250 * (2 ** (attempt - 1))), signal);
        continue;
      }
      if (response.ok) return response;
      lastResponse = response;
      if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts) {
        return requireOk(response);
      }
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      const backoffMs = retryAfterMs ?? Math.min(2_000, 250 * (2 ** (attempt - 1)));
      await abortableDelay(backoffMs, signal);
    }
    return requireOk(lastResponse!);
  }

  return {
    fetch: politeFetch,
    async fetchJson<T = any>(url: string, options: PoliteFetchOptions = {}): Promise<T> {
      const response = await politeFetch(url, options);
      try {
        return (await response.json()) as T;
      } catch (error) {
        throw new Error(`${provider} returned invalid JSON: ${errorMessage(error)}`);
      }
    },
    async fetchText(url: string, options: PoliteFetchOptions = {}): Promise<string> {
      const response = await politeFetch(url, options);
      return response.text();
    },
  };
}
