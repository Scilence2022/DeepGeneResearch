import { describe, expect, it } from 'vitest';
import {
  buildExactAnnotationFieldEvidence,
  currentAnnotationHasValue,
  isMoreSpecificProduct,
  normalizeAnnotationQualifierValue,
} from './current-annotation';

describe('current annotation snapshot handling', () => {
  it('permits only a lexical refinement of a placeholder or generic product', () => {
    expect(isMoreSpecificProduct('Homoserine kinase', 'hypothetical protein')).toBe(true);
    expect(isMoreSpecificProduct('Lysine-sensitive aspartokinase 3', 'aspartokinase')).toBe(true);
    expect(isMoreSpecificProduct('Homoserine kinase', 'Homoserine kinase')).toBe(false);
    expect(isMoreSpecificProduct('Aspartate kinase', 'Homoserine kinase')).toBe(false);
    expect(isMoreSpecificProduct('hypothetical protein', 'unknown protein')).toBe(false);
    expect(isMoreSpecificProduct('Homoserine kinase', undefined)).toBe(false);
  });

  it('emits deterministic product provenance only for a permitted refinement', () => {
    const evidence = buildExactAnnotationFieldEvidence({
      annotation: {
        product: 'Homoserine kinase',
        ecNumbers: ['2.7.1.39'],
      },
      currentAnnotation: { product: 'hypothetical protein' },
      sourceId: 'UniProtKB:P00547',
      database: 'uniprot',
      url: 'https://www.uniprot.org/uniprotkb/P00547/entry',
      retrievedAt: '2026-07-16T00:00:00.000Z',
    });

    expect(evidence?.product).toEqual([expect.objectContaining({
      value: 'Homoserine kinase',
      currentValue: 'hypothetical protein',
      justification: 'Exact-target authoritative evidence provides a more specific CDS product than the current placeholder or generic product.',
    })]);
    expect(evidence?.ecNumbers).toHaveLength(1);

    const alreadySpecific = buildExactAnnotationFieldEvidence({
      annotation: { product: 'Homoserine kinase' },
      currentAnnotation: { product: 'Threonine-pathway homoserine kinase' },
      sourceId: 'UniProtKB:P00547',
      database: 'uniprot',
      url: 'https://www.uniprot.org/uniprotkb/P00547/entry',
      retrievedAt: '2026-07-16T00:00:00.000Z',
    });
    expect(alreadySpecific).toBeUndefined();
  });

  it('normalizes qualifier prefixes and detects existing values', () => {
    const snapshot = {
      note: ['Evidence-based functional summary. PMID:38253429'],
      EC_number: ['EC: 2.7.1.39'],
      go_terms: ['GO:0004413'],
      ko: ['KO: K00872'],
      pathway: ['KEGG:eco00260'],
      db_xref: ['UniProtKB: P00547'],
    };

    expect(normalizeAnnotationQualifierValue('EC_number', '2.7.1.39')).toBe('2.7.1.39');
    expect(currentAnnotationHasValue(snapshot, 'EC_number', '2.7.1.39')).toBe(true);
    expect(currentAnnotationHasValue(snapshot, 'go_terms', 'GO:0004413')).toBe(true);
    expect(currentAnnotationHasValue(snapshot, 'ko', 'K00872')).toBe(true);
    expect(currentAnnotationHasValue(snapshot, 'pathway', 'KEGG:eco00260')).toBe(true);
    expect(currentAnnotationHasValue(snapshot, 'db_xref', 'UniProtKB:P00547')).toBe(true);
    expect(currentAnnotationHasValue(snapshot, 'note', ' evidence-based functional summary.   PMID:38253429 ')).toBe(true);
  });
});
