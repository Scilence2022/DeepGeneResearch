import { describe, expect, it } from 'vitest';
import { createFetchSignal } from './fetch-signal';

describe('createFetchSignal', () => {
  it('combines cancellation without AbortSignal.any on Node 18-compatible runtimes', () => {
    const originalAny = AbortSignal.any;
    Object.defineProperty(AbortSignal, 'any', {
      configurable: true,
      value: undefined,
      writable: true,
    });

    try {
      const caller = new AbortController();
      const combined = createFetchSignal(caller.signal, 30_000);
      const reason = new Error('caller cancelled');

      caller.abort(reason);

      expect(combined.aborted).toBe(true);
      expect(combined.reason).toBe(reason);
    } finally {
      Object.defineProperty(AbortSignal, 'any', {
        configurable: true,
        value: originalAny,
        writable: true,
      });
    }
  });
});
