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
    expect(focused.some(query => query.category === 'function')).toBe(true);
    expect(focused.some(query => query.category === 'basic_info')).toBe(true);
    expect(comprehensive.some(query => query.category === 'function')).toBe(true);
  });

  it('keeps identity baselines and deduplicates overlapping CDS refinement aspects', () => {
    const generator = new GeneQueryGenerator({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      researchFocus: ['protein function', 'pathway', 'orthologs'],
    });
    const queries = generator.generateFocusedQueries([
      'CDS product refinement',
      'protein function',
      'EC number',
      'gene name',
      'cellular localization',
      'pathway',
      'orthologs',
    ]);
    const keys = queries.map(query => `${query.database}:${query.query}`.toLowerCase());

    expect(queries.some(query => query.database === 'ncbi_gene')).toBe(true);
    expect(queries.some(query => query.database === 'uniprot')).toBe(true);
    expect(queries.some(query => query.database === 'kegg')).toBe(true);
    expect(queries.some(query => query.category === 'evolution')).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
