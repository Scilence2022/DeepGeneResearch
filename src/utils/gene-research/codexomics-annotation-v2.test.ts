import { describe, expect, it } from 'vitest';
import { assertAnnotationChangeSetProposalIntegrity } from '@/contracts/annotation-change-set';
import { buildCodeXomicsAnnotationProposal } from './codexomics-annotation';

const target = {
  workspaceId: 'ws_a',
  genomeId: 'genome_a',
  annotationRevision: 7,
  featureId: 'feat_thrB',
  featureHash: 'feature-hash',
  annotationId: 'annotation_thrB',
  featureType: 'CDS',
  chromosome: 'U00096',
  locusTag: 'b0003',
  geneSymbol: 'thrB',
  organism: 'Escherichia coli',
};

const sourceId = 'UniProtKB:P00547';
const sourceUrl = 'https://www.uniprot.org/uniprotkb/P00547/entry';

function provenance(value: string, extra: Record<string, unknown> = {}) {
  return {
    value,
    sourceId,
    database: 'uniprot',
    url: sourceUrl,
    retrievedAt: '2026-07-14T00:00:00.000Z',
    ...extra,
  };
}

function exactStructuredSource({
  matchedTarget = target,
  targetMatch = true,
  currentProduct = 'legacy kinase annotation',
  includeFieldEvidence = true,
}: {
  matchedTarget?: Record<string, unknown>;
  targetMatch?: boolean;
  currentProduct?: string;
  includeFieldEvidence?: boolean;
} = {}) {
  return {
    title: 'Reviewed homoserine kinase record',
    sourceId,
    url: sourceUrl,
    database: 'uniprot',
    authoritative: true,
    targetMatch,
    target: matchedTarget,
    annotation: {
      product: 'Homoserine kinase',
      ecNumbers: ['2.7.1.39'],
      goTerms: ['GO:0004413'],
      pathwayTerms: ['KEGG:eco00260'],
      dbXrefs: ['UniProtKB:P00547'],
      reviewed: true,
      ...(includeFieldEvidence ? {
        fieldEvidence: {
          product: provenance('Homoserine kinase', {
            currentValue: currentProduct,
            justification: 'The exact reviewed protein record supplies a more specific recommended product.',
          }),
          ecNumbers: provenance('2.7.1.39'),
          goTerms: provenance('GO:0004413'),
          pathwayTerms: provenance('KEGG:eco00260'),
          dbXrefs: provenance('UniProtKB:P00547'),
        },
      } : {}),
    },
  };
}

describe('CodeXomics annotation ChangeSet proposal v2', () => {
  it('accepts exact-target authoritative structured fields with field-level provenance', () => {
    const currentProduct = 'bifunctional homoserine kinase / 4-hydroxythreonine kinase';
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      currentProduct,
      finalReport: 'The narrative may summarize the research but cannot authorize mutations.',
      sources: [exactStructuredSource({ currentProduct })],
      confidence: 0.9,
    });

    expect(proposal.status).toBe('ready_for_validation');
    expect(proposal.target).toEqual(target);
    expect(proposal.baseRevision).toBe(7);
    expect(proposal.updates).toEqual({
      product: 'Homoserine kinase',
      EC_number: ['2.7.1.39'],
      go_terms: ['GO:0004413'],
      pathway: ['KEGG:eco00260'],
      db_xref: ['UniProtKB:P00547'],
    });
    expect(proposal.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'replaceQualifier', field: 'product', value: 'Homoserine kinase' }),
      expect.objectContaining({ op: 'addQualifier', field: 'EC_number', value: '2.7.1.39' }),
      expect.objectContaining({ op: 'addQualifier', field: 'go_terms', value: 'GO:0004413' }),
      expect.objectContaining({ op: 'addQualifier', field: 'pathway', value: 'KEGG:eco00260' }),
      expect.objectContaining({ op: 'addDbxref', field: 'db_xref', value: 'UniProtKB:P00547' }),
    ]));
    expect(proposal.claims.every(claim => claim.evidenceIds.length > 0)).toBe(true);
    expect(proposal.claims.flatMap(claim => claim.evidenceIds).every(evidenceId =>
      proposal.evidenceManifest.sourceRecords.find(record => record.id === evidenceId)?.supporting
    )).toBe(true);
    expect(proposal.mergeHints.overwriteProduct).toBe(true);
  });

  it('rejects report text and Searx snippets as mutation evidence', () => {
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      currentProduct: 'legacy kinase annotation',
      finalReport: 'Product: invented kinase. EC: 9.9.9.9. GO:9999999. KEGG:fake. UniProtKB:FAKE.',
      sources: [{
        title: 'thrB annotation snippet',
        content: 'Homoserine kinase EC: 2.7.1.39 GO:0004413 KEGG:eco00260 UniProtKB:P00547',
        url: 'https://search.example/result',
        database: 'searxng',
      }],
    });

    expect(proposal.status).toBe('draft_requires_evidence');
    expect(proposal.operations).toEqual([]);
    expect(proposal.claims).toEqual([]);
    expect(proposal.updates).toEqual({});
    expect(proposal.ecNumbers).toEqual([]);
    expect(proposal.goTerms).toEqual([]);
    expect(proposal.pathwayTerms).toEqual([]);
    expect(proposal.dbXrefs).toEqual([]);
    expect(proposal.evidenceManifest.sourceRecords.every(record => !record.supporting)).toBe(true);
  });

  it('rejects an authoritative-looking source that is not matched to the exact target', () => {
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      currentProduct: 'legacy kinase annotation',
      sources: [
        exactStructuredSource({ targetMatch: false }),
        exactStructuredSource({ matchedTarget: { ...target, featureId: 'feat_other' } }),
      ],
    });

    expect(proposal.status).toBe('draft_requires_evidence');
    expect(proposal.operations).toEqual([]);
    expect(proposal.claims).toEqual([]);
    expect(proposal.mergeHints.overwriteProduct).toBe(false);
  });

  it('rejects structured values without field-level evidence provenance', () => {
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      currentProduct: 'legacy kinase annotation',
      sources: [exactStructuredSource({ includeFieldEvidence: false })],
    });

    expect(proposal.operations).toEqual([]);
    expect(proposal.claims).toEqual([]);
  });

  it('does not replace a product when the current product was not supplied', () => {
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      sources: [exactStructuredSource()],
    });

    expect(proposal.updates.product).toBeUndefined();
    expect(proposal.operations.some(operation => operation.field === 'product')).toBe(false);
    expect(proposal.mergeHints.overwriteProduct).toBe(false);
    expect(proposal.operations.some(operation => operation.field === 'EC_number')).toBe(true);
  });

  it('does not replace an equivalent current product', () => {
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      currentProduct: ' Homoserine   Kinase ',
      sources: [exactStructuredSource({ currentProduct: ' Homoserine   Kinase ' })],
    });

    expect(proposal.updates.product).toBeUndefined();
    expect(proposal.mergeHints.overwriteProduct).toBe(false);
  });

  it('does not launder a report-only sibling value through exact structured evidence', () => {
    const source = exactStructuredSource();
    source.annotation.goTerms = ['GO:0000001'];
    source.annotation.fieldEvidence!.goTerms = provenance('GO:0000001');
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      sources: [source],
      finalReport: 'The model additionally asserted GO:9999999 without structured provenance.',
    });

    expect(proposal.goTerms).toEqual(['GO:0000001']);
    expect(proposal.claims.filter(claim => claim.field === 'go_terms').map(claim => claim.value))
      .toEqual(['GO:0000001']);
  });

  it('preserves the immutable target and hashes retrieved audit context', () => {
    const first = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'wrong-query-symbol',
      organism: 'Escherichia coli',
      target,
      sources: [{ pmid: '12345678', content: 'original evidence' }],
    });
    const changed = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'wrong-query-symbol',
      organism: 'Escherichia coli',
      target,
      sources: [{ pmid: '12345678', content: 'changed evidence' }],
    });

    expect(first.target).toEqual(target);
    expect(first.evidenceManifest.sourceRecords[0].supporting).toBe(false);
    expect(first.evidenceManifest.sourceRecords[0].sourceHash)
      .not.toBe(changed.evidenceManifest.sourceRecords[0].sourceHash);
  });

  it('emits a non-committable draft when the caller did not resolve a target', () => {
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      currentProduct: 'legacy kinase annotation',
      sources: [exactStructuredSource()],
      confidence: 80,
    });

    expect(proposal.status).toBe('draft_requires_target');
    expect(proposal.operations).toEqual([]);
    expect(proposal.baseRevision).toBeUndefined();
    expect(proposal.confidence).toBeNull();
  });

  it('rejects a mutating contract whose claim has no supporting evidence', () => {
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      currentProduct: 'legacy kinase annotation',
      sources: [exactStructuredSource()],
    });
    proposal.claims[0].evidenceIds = [];

    expect(() => assertAnnotationChangeSetProposalIntegrity(proposal)).toThrow('has no supporting evidence');
  });
});
