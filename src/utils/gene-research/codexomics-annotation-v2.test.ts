import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { assertAnnotationChangeSetProposalIntegrity } from '@/contracts/annotation-change-set';
import { buildCodeXomicsAnnotationProposal } from './codexomics-annotation';
import { canonicalizePubMedAbstract } from './literature-findings';

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
    const currentProduct = 'hypothetical protein';
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      currentAnnotation: { product: currentProduct },
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
    expect(proposal.researchSummary).toMatchObject({
      schema: 'dgr.curation-summary.v1',
      facts: expect.arrayContaining([
        expect.objectContaining({ category: 'identity', field: 'product', value: 'Homoserine kinase' }),
        expect.objectContaining({ category: 'function', field: 'enzyme_classification', value: ['2.7.1.39'] }),
      ]),
    });
    expect(proposal.researchSummary.facts.every(fact => fact.evidenceIds.length > 0)).toBe(true);
    expect(proposal.evidenceManifest.sourceRecords.every(record => !record.label.includes('retrievedAt'))).toBe(true);
    expect(proposal.mergeHints.overwriteProduct).toBe(true);
  });

  it('limits mutation fields according to the resolved feature type', () => {
    const geneTarget = { ...target, featureType: 'gene', featureId: 'feat_gene_thrB' };
    const geneProposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target: geneTarget,
      currentAnnotation: { product: 'hypothetical protein' },
      sources: [exactStructuredSource({ matchedTarget: geneTarget, currentProduct: 'hypothetical protein' })],
    });
    expect(geneProposal.operations.map(operation => operation.field)).toEqual(['db_xref']);

    const rnaTarget = { ...target, featureType: 'ncRNA', featureId: 'feat_rna_thrB' };
    const rnaProposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target: rnaTarget,
      currentAnnotation: { product: 'hypothetical protein' },
      sources: [exactStructuredSource({ matchedTarget: rnaTarget, currentProduct: 'hypothetical protein' })],
    });
    expect(rnaProposal.operations.map(operation => operation.field)).toEqual(
      expect.arrayContaining(['product', 'go_terms', 'pathway', 'db_xref']),
    );
    expect(rnaProposal.operations.some(operation => operation.field === 'EC_number')).toBe(false);
    expect(rnaProposal.operations.some(operation => operation.field === 'ko')).toBe(false);
  });

  it('includes only target-relevant PubMed records in the concise literature summary', () => {
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      target: { ...target, featureId: 'b4024', locusTag: 'b4024', geneSymbol: 'lysC' },
      sources: [
        {
          title: 'Direct control of the Escherichia coli lysC riboswitch',
          url: 'https://pubmed.ncbi.nlm.nih.gov/38253429/',
          database: 'pubmed',
          provenance: { provider: 'pubmed', recordId: '38253429' },
          structuredData: {
            targetRelevance: {
              accepted: true,
              score: 12,
              directness: 'direct',
              reason: 'target supported by gene_symbol, organism_text',
            },
            literatureReferences: [{
              pmid: '38253429',
              year: 2024,
              abstract: 'In Escherichia coli, lysC expression is repressed by a lysine-responsive regulatory mechanism.',
            }],
          },
        },
        {
          title: 'Lysozyme C assay',
          url: 'https://pubmed.ncbi.nlm.nih.gov/11111111/',
          database: 'pubmed',
          provenance: { provider: 'pubmed', recordId: '11111111' },
          structuredData: {
            targetRelevance: { accepted: false, score: 0, reason: 'no exact target identity' },
            literatureReferences: [{ pmid: '11111111', year: 2020 }],
          },
        },
      ],
    });

    expect(proposal.researchSummary.literature).toHaveLength(1);
    expect(proposal.researchSummary.literature[0]).toMatchObject({
      pmid: '38253429',
      relevance: 'high',
    });
    expect(proposal.researchSummary.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: 'regulation',
        field: 'literature_finding',
        evidenceLevel: 'target_literature',
        citation: expect.objectContaining({
          type: 'pmid',
          id: '38253429',
          url: 'https://pubmed.ncbi.nlm.nih.gov/38253429/',
        }),
      }),
    ]));
    expect(proposal.curationNote).toMatchObject({
      schema: 'dgr.curation-note.v1',
      coverage: expect.objectContaining({ includedFactCount: 1 }),
      segments: [expect.objectContaining({
        category: 'regulation',
        factIds: expect.any(Array),
        citations: [expect.objectContaining({ type: 'pmid', id: '38253429' })],
      })],
    });
    expect(proposal.curationNote?.text).toContain('(PMID:38253429)');
    expect(proposal.updates.note).toBe(proposal.curationNote?.text);
    expect(proposal.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: 'addQualifier', field: 'note', value: proposal.curationNote?.text }),
    ]));

    const repeated = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      target: { ...target, featureId: 'b4024', locusTag: 'b4024', geneSymbol: 'lysC' },
      currentAnnotation: { note: [String(proposal.curationNote?.text)] },
      sources: [{
        title: 'Direct control of the Escherichia coli lysC riboswitch',
        url: 'https://pubmed.ncbi.nlm.nih.gov/38253429/',
        database: 'pubmed',
        provenance: { provider: 'pubmed', recordId: '38253429' },
        structuredData: {
          targetRelevance: { accepted: true, score: 12, directness: 'direct', reason: 'exact target and organism' },
          literatureReferences: [{
            pmid: '38253429',
            abstract: 'In Escherichia coli, lysC expression is repressed by a lysine-responsive regulatory mechanism.',
          }],
        },
      }],
    });
    expect(repeated.curationNote).toBeUndefined();
    expect(repeated.operations.some(operation => operation.field === 'note')).toBe(false);
  });

  it('retains a complete 38-paper exact-target bibliography in the evidence manifest', () => {
    const sources = Array.from({ length: 38 }, (_, index) => {
      const pmid = String(12000000 + index);
      return {
        title: `Exact lysC study ${index + 1}`,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        database: 'pubmed',
        provenance: { provider: 'pubmed', recordId: pmid },
        structuredData: {
          targetRelevance: {
            accepted: true,
            score: 12,
            directness: 'direct',
            reason: 'exact target and organism',
          },
          literatureReferences: [{
            pmid,
            year: 2000 + (index % 20),
            abstract: `In Escherichia coli, lysC expression was increased in exact-target experiment ${index + 1}.`,
          }],
        },
      };
    });
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      target: { ...target, featureId: 'b4024', locusTag: 'b4024', geneSymbol: 'lysC' },
      sources,
    });

    expect(proposal.evidenceManifest.sourceRecords).toHaveLength(38);
    expect(proposal.evidenceDetails).toHaveLength(38);
    expect(proposal.researchSummary.literature).toHaveLength(30);
    expect(proposal.operations).toEqual([
      expect.objectContaining({ op: 'addQualifier', field: 'note' }),
    ]);
    expect(proposal.curationNote?.segments).toHaveLength(1);
    expect(proposal.curationNote?.coverage).toMatchObject({
      availableFactCount: 18,
      includedFactCount: 1,
    });
    expect(proposal.curationNote?.coverage.omittedFactIds).toHaveLength(17);
    expect(proposal.researchSummary.facts
      .filter(fact => fact.evidenceLevel === 'target_literature'))
      .toHaveLength(18);
  });

  it('deduplicates report citations against structured source records by exact identifiers', () => {
    const abstract = 'In Escherichia coli, lysC expression is repressed by a lysine-responsive regulatory mechanism.';
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      target: { ...target, featureId: 'b4024', locusTag: 'b4024', geneSymbol: 'lysC' },
      finalReport: [
        '[PMID:38253429](https://pubmed.ncbi.nlm.nih.gov/38253429/)',
        '[UniProtKB:P08660](https://www.uniprot.org/uniprotkb/P08660/entry)',
      ].join('\n'),
      sources: [
        {
          title: 'Direct control of the Escherichia coli lysC riboswitch',
          url: 'https://pubmed.ncbi.nlm.nih.gov/38253429/',
          database: 'pubmed',
          provenance: { provider: 'pubmed', recordId: '38253429' },
          structuredData: {
            targetRelevance: {
              accepted: true,
              score: 12,
              directness: 'direct',
              reason: 'exact target and organism',
            },
            literatureReferences: [{
              pmid: '38253429',
              doi: '10.1261/rna.079779.123',
              abstract,
            }],
          },
        },
        {
          title: 'Reviewed lysC record',
          url: 'https://www.uniprot.org/uniprotkb/P08660/entry',
          database: 'uniprot',
        },
      ],
    });

    expect(proposal.evidenceManifest.sourceRecords).toHaveLength(2);
    const literatureFact = proposal.researchSummary.facts.find(fact => fact.evidenceLevel === 'target_literature');
    expect(literatureFact?.evidenceIds).toHaveLength(1);
    expect(proposal.evidenceManifest.sourceRecords.find(record => record.id === literatureFact?.evidenceIds[0]))
      .toMatchObject({
        database: 'pubmed',
        identifiers: expect.arrayContaining([
          { scheme: 'pmid', value: '38253429' },
          { scheme: 'doi', value: '10.1261/rna.079779.123' },
        ]),
        sourceBinding: {
          schema: 'dgr.evidence-source-binding.v1',
          sourceCollection: 'sources',
          selector: {
            database: 'pubmed',
            identifier: { scheme: 'pmid', value: '38253429' },
          },
          content: {
            relativeJsonPointer: '/structuredData/literatureReferences/0/abstract',
            canonicalization: 'dgr.pubmed-abstract.v1',
            sha256: createHash('sha256').update(canonicalizePubMedAbstract(abstract)).digest('hex'),
            hashEncoding: 'utf8',
            length: canonicalizePubMedAbstract(abstract).length,
            lengthEncoding: 'utf16_code_units',
          },
        },
      });
    const basis = literatureFact?.literatureBasis;
    expect(basis).toMatchObject({
      kind: 'pubmed_abstract_span',
      evidenceId: literatureFact?.evidenceIds[0],
      pmid: '38253429',
      abstractSha256: createHash('sha256').update(canonicalizePubMedAbstract(abstract)).digest('hex'),
      abstractLength: canonicalizePubMedAbstract(abstract).length,
      canonicalization: 'dgr.pubmed-abstract.v1',
      offsetEncoding: 'utf16_code_units',
      hashEncoding: 'utf8',
    });
    expect(basis?.excerpt).toBe(literatureFact?.statement);
    expect(canonicalizePubMedAbstract(abstract).slice(basis?.excerptStart, basis?.excerptEnd))
      .toBe(basis?.excerpt);
    expect(basis?.excerptSha256).toBe(
      createHash('sha256').update(String(basis?.excerpt)).digest('hex')
    );
  });

  it('fails closed when duplicate task sources disagree about a PMID abstract', () => {
    const makeSource = (abstract: string) => ({
      title: 'Direct control of the Escherichia coli lysC riboswitch',
      url: 'https://pubmed.ncbi.nlm.nih.gov/38253429/',
      database: 'pubmed',
      provenance: { provider: 'pubmed', recordId: '38253429' },
      structuredData: {
        targetRelevance: {
          accepted: true,
          score: 12,
          directness: 'direct',
          reason: 'exact target and organism',
        },
        literatureReferences: [{ pmid: '38253429', abstract }],
      },
    });
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      target: { ...target, featureId: 'b4024', locusTag: 'b4024', geneSymbol: 'lysC' },
      sources: [
        makeSource('In Escherichia coli, lysC expression was increased by lysine limitation.'),
        makeSource('In Escherichia coli, lysC expression was decreased by lysine limitation.'),
      ],
    });

    expect(proposal.evidenceManifest.sourceRecords).toHaveLength(1);
    expect(proposal.evidenceManifest.sourceRecords[0].sourceBinding).toBeUndefined();
    expect(proposal.researchSummary.facts.filter(fact => fact.evidenceLevel === 'target_literature'))
      .toEqual([]);
  });

  it('rejects report text and Searx snippets as mutation evidence', () => {
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      currentAnnotation: { product: 'legacy kinase annotation' },
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
      currentAnnotation: { product: 'legacy kinase annotation' },
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
      currentAnnotation: { product: 'legacy kinase annotation' },
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
      currentAnnotation: { product: ' Homoserine   Kinase ' },
      sources: [exactStructuredSource({ currentProduct: ' Homoserine   Kinase ' })],
    });

    expect(proposal.updates.product).toBeUndefined();
    expect(proposal.mergeHints.overwriteProduct).toBe(false);
  });

  it('does not replace an already-specific product with a different exact-source name', () => {
    const currentProduct = 'Threonine-pathway homoserine kinase';
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      currentAnnotation: { product: currentProduct },
      sources: [exactStructuredSource({ currentProduct })],
    });

    expect(proposal.operations.some(operation => operation.field === 'product')).toBe(false);
    expect(proposal.mergeHints.overwriteProduct).toBe(false);
  });

  it('omits every operation when the resolved CDS already contains all proposed qualifiers', () => {
    const currentProduct = 'Homoserine kinase';
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      target,
      currentAnnotation: {
        product: currentProduct,
        EC_number: ['EC:2.7.1.39'],
        go_terms: ['GO:0004413'],
        pathway: ['KEGG:eco00260'],
        db_xref: ['UniProtKB:P00547'],
      },
      sources: [exactStructuredSource({ currentProduct })],
    });

    expect(proposal.status).toBe('draft_requires_evidence');
    expect(proposal.operations).toEqual([]);
    expect(proposal.claims).toEqual([]);
    expect(proposal.updates).toEqual({});
    expect(proposal.ecNumbers).toEqual([]);
    expect(proposal.goTerms).toEqual([]);
    expect(proposal.pathwayTerms).toEqual([]);
    expect(proposal.dbXrefs).toEqual([]);
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
      currentAnnotation: { product: 'legacy kinase annotation' },
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
      currentAnnotation: { product: 'legacy kinase annotation' },
      sources: [exactStructuredSource()],
    });
    proposal.claims[0].evidenceIds = [];

    expect(() => assertAnnotationChangeSetProposalIntegrity(proposal)).toThrow('has no supporting evidence');
  });
});
