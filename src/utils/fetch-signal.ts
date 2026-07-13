const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/** Combine caller cancellation with a bounded provider-request timeout. */
export function createFetchSignal(
  signal?: AbortSignal,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!signal) return timeoutSignal;

  // AbortSignal.any landed in later Node 18 releases. Keep the documented
  // Node 18.18 runtime baseline working even if a vendor runtime omits it.
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([signal, timeoutSignal]);
  }

  const controller = new AbortController();
  const sources = [signal, timeoutSignal];
  const cleanup = () => {
    for (const source of sources) source.removeEventListener('abort', onAbort);
  };
  const onAbort = (event: Event) => {
    cleanup();
    const source = event.target as AbortSignal;
    controller.abort(source.reason);
  };

  const alreadyAborted = sources.find(source => source.aborted);
  if (alreadyAborted) {
    controller.abort(alreadyAborted.reason);
  } else {
    for (const source of sources) source.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}
