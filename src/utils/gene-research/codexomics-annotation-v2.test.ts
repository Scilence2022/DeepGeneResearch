import { describe, expect, it } from 'vitest';
import { buildCodeXomicsAnnotationProposal } from './codexomics-annotation';
import { assertAnnotationChangeSetProposalIntegrity } from '@/contracts/annotation-change-set';

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
        assemblySha256: 'assembly-sha256',
        locusTag: 'b0001',
      },
      finalReport: 'Functional summary. PMID:12345678. GO:0003674.',
      sources: [{ pmid: '12345678', title: 'Curated GO:0003674 study', database: 'pubmed' }],
      confidence: 0.9,
    });

    expect(proposal.schema).toBe('codexomics.annotation-change-set.v2');
    expect(proposal.status).toBe('ready_for_validation');
    expect(proposal.target.featureId).toBe('feat_thrL');
    expect(proposal.target.assemblySha256).toBe('assembly-sha256');
    expect(proposal.baseRevision).toBe(7);
    expect(proposal.evidenceManifest.sourceRecords.length).toBeGreaterThan(0);
    expect(proposal.claims.find(claim => claim.field === 'go_terms')?.evidenceIds.length).toBeGreaterThan(0);
    expect(proposal.claims.every(claim => claim.evidenceIds.length > 0)).toBe(true);
    expect(proposal.operations.every(operation => operation.claimIds.length === 1)).toBe(true);
  });

  it('preserves the immutable target and hashes retrieved evidence content', () => {
    const target = {
      workspaceId: 'ws_a',
      genomeId: 'genome_a',
      annotationRevision: 7,
      featureId: 'feat_thrL',
      featureHash: 'feature-hash',
      annotationId: 'annotation_thrL',
      featureType: 'CDS',
      chromosome: 'NC_000913.3',
      geneSymbol: 'thrL-resolved',
      organism: 'Escherichia coli',
    };
    const first = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'wrong-query-symbol',
      organism: 'Escherichia coli',
      target,
      finalReport: 'PMID:12345678. GO:0003674.',
      sources: [{ pmid: '12345678', content: 'GO:0003674 original evidence' }],
    });
    const changed = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'wrong-query-symbol',
      organism: 'Escherichia coli',
      target,
      finalReport: 'PMID:12345678. GO:0003674.',
      sources: [{ pmid: '12345678', content: 'GO:0003674 changed evidence' }],
    });

    expect(first.target).toEqual(target);
    expect(first.evidenceManifest.sourceRecords[0].sourceHash)
      .not.toBe(changed.evidenceManifest.sourceRecords[0].sourceHash);
  });

  it('emits a non-committable draft when the caller did not resolve a CodeXomics target', () => {
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'lacZ',
      organism: 'Escherichia coli',
      finalReport: 'PMID:12345678.',
      confidence: 80,
    });

    expect(proposal.status).toBe('draft_requires_target');
    expect(proposal.baseRevision).toBeUndefined();
    expect(proposal.confidence).toBeNull();
  });

  it('does not emit mutating operations for unverified citation text', () => {
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
      },
      finalReport: 'Functional summary based only on an unverified PMID:12345678 citation. GO:0003674.',
    });

    expect(proposal.status).toBe('draft_requires_evidence');
    expect(proposal.operations).toEqual([]);
    expect(proposal.claims).toEqual([]);
    expect(proposal.updates).toEqual({});
    expect(proposal.evidenceManifest.sourceRecords.every(record => !record.supporting)).toBe(true);
  });

  it('does not launder an unsupported sibling value through a supported multi-value claim', () => {
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
      },
      finalReport: 'PMID:12345678 reports GO:0000001. A generated paragraph also asserted GO:9999999.',
      sources: [{ pmid: '12345678', content: 'Curated evidence for GO:0000001 only.' }],
    });

    expect(proposal.updates.go_terms).toEqual(['GO:0000001']);
    expect(proposal.claims.filter(claim => claim.field === 'go_terms').map(claim => claim.value))
      .toEqual(['GO:0000001']);
    expect(proposal.operations.filter(operation => operation.field === 'go_terms').map(operation => operation.value))
      .toEqual(['GO:0000001']);
  });

  it('rejects a mutating contract whose claim has no supporting evidence', () => {
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
      },
      finalReport: 'PMID:12345678 supports GO:0000001.',
      sources: [{ pmid: '12345678', content: 'GO:0000001' }],
    });
    proposal.claims[0].evidenceIds = [];

    expect(() => assertAnnotationChangeSetProposalIntegrity(proposal)).toThrow('has no supporting evidence');
  });

  it('keeps a partially grounded mixed narrative non-mutating', () => {
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
      },
      finalReport: 'Functional summary: ThrL catalyzes threonine synthesis and causes colorectal cancer.',
      sources: [{
        pmid: '12345678',
        title: 'ThrL enzyme activity',
        content: 'ThrL catalyzes a step in threonine synthesis in Escherichia coli.',
      }],
    });

    expect(proposal.updates.function_research_summary).toBeUndefined();
    expect(proposal.updates.note).toBeUndefined();
    expect(proposal.operations.some(operation => operation.field === 'function_research_summary')).toBe(false);
  });
});
