import { describe, expect, it } from 'vitest';
import { GeneQueryGenerator } from './query-generator';

describe('GeneQueryGenerator', () => {
  it('normalizes natural-language functional annotation requests into function queries', () => {
    const generator = new GeneQueryGenerator({
      geneSymbol: 'Cgl0002',
      organism: 'Corynebacterium glutamicum',
      researchFocus: ['functional annotation'],
      specificAspects: ['protein function'],
    });

    const focused = generator.generateFocusedQueries(['protein function']);
    const comprehensive = generator.generateComprehensiveQueries();

    expect(focused.length).toBeGreaterThan(0);
    expect(focused.every(query => query.category === 'function')).toBe(true);
    expect(comprehensive.some(query => query.category === 'function')).toBe(true);
  });
});
