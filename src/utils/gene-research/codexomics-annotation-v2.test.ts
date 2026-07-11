import { describe, expect, it } from 'vitest';
import { buildCodeXomicsAnnotationProposal } from './codexomics-annotation';

describe('CodeXomics annotation ChangeSet proposal v2', () => {
  it('binds evidence-backed operations to an exact CodeXomics feature target', () => {
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrL',
      organism: 'Escherichia coli',
      target: {
        workspaceId: 'ws_a',
        genomeId: 'genome_a',
        annotationRevision: 7,
        featureId: 'feat_thrL',
        featureHash: 'feature-hash',
        chromosome: 'NC_000913.3',
        locusTag: 'b0001',
      },
      finalReport: 'Functional summary. PMID:12345678. GO:0003674.',
      sources: [{ pmid: '12345678', title: 'Curated study', database: 'pubmed' }],
      confidence: 0.9,
    });

    expect(proposal.schema).toBe('codexomics.annotation-change-set.v2');
    expect(proposal.status).toBe('ready_for_validation');
    expect(proposal.target.featureId).toBe('feat_thrL');
    expect(proposal.baseRevision).toBe(7);
    expect(proposal.evidenceManifest.sourceRecords.length).toBeGreaterThan(0);
    expect(proposal.claims.every(claim => claim.evidenceIds.length > 0)).toBe(true);
    expect(proposal.operations.every(operation => operation.claimIds.length === 1)).toBe(true);
  });

  it('emits a non-committable draft when the caller did not resolve a CodeXomics target', () => {
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'lacZ',
      organism: 'Escherichia coli',
      finalReport: 'PMID:12345678.',
    });

    expect(proposal.status).toBe('draft_requires_target');
    expect(proposal.baseRevision).toBeUndefined();
  });
});
