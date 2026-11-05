import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

describe('Zod collection size backport', () => {
  it('rejects oversized arrays and sets before visiting their elements', async () => {
    const visit = vi.fn(() => true);
    const element = z.string().refine(visit);
    const input = ['first', 'second'];
    for (const result of [
      z.array(element).max(1).safeParse(input),
      await z.array(element).length(1).safeParseAsync(input),
      z.set(element).max(1).safeParse(new Set(input)),
    ]) {
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues).toMatchObject([{ code: 'too_big' }]);
    }
    expect(visit).not.toHaveBeenCalled();
    expect(z.array(element).max(2).parse(input)).toEqual(input);
    expect(visit).toHaveBeenCalledTimes(2);
  });
});
