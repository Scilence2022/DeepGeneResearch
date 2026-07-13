import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchPubMed } from './search-providers';

describe('gene search provider cancellation', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('threads caller cancellation into an active provider fetch', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error('missing fetch signal'));
        return;
      }
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);

    const research = searchPubMed({
      provider: 'pubmed',
      query: 'thrL function',
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
      signal: controller.signal,
    });
    controller.abort(new Error('curator cancelled research'));

    await expect(research).rejects.toThrow('curator cancelled research');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });
});
