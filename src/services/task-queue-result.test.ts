import { describe, expect, it } from 'vitest';
import type { GeneResearchParameters } from '@/models/task';
import { isSubstantiveResearchResult } from './task-queue';

const target = {
  workspaceId: 'ws_a',
  genomeId: 'genome_a',
  annotationRevision: 1,
  featureId: 'feature_thrB',
  featureHash: 'hash_thrB',
  chromosome: 'NC_000913.3',
};
const parameters: GeneResearchParameters = {
  geneSymbol: 'thrB',
  organism: 'Escherichia coli',
  target,
};

describe('research result quality gate', () => {
  it('rejects placeholder and evidence-free reports from cache reuse', () => {
    expect(isSubstantiveResearchResult({
      finalReport: 'Molecular Function: [Brief description of primary function]',
      sources: [],
      metadata: { searchDiagnostics: { successfulSearches: 0 } },
    }, parameters)).toBe(false);
  });

  it('rejects a sole search snippet even when a search succeeded', () => {
    expect(isSubstantiveResearchResult({
      finalReport: 'thrB encodes homoserine kinase (EC 2.7.1.39).',
      sources: [{
        database: 'searxng',
        url: 'https://example.test/thrb',
        content: 'A single search snippet mentioning the target cannot establish a reusable annotation evidence package.',
      }],
      metadata: { searchDiagnostics: { successfulSearches: 1 } },
      annotationProposal: { target, baseRevision: 1 },
    }, parameters)).toBe(false);
  });

  it('accepts exact-target authoritative and independently corroborated evidence', () => {
    expect(isSubstantiveResearchResult({
      finalReport: 'thrB encodes homoserine kinase (EC 2.7.1.39).',
      sources: [
        {
          database: 'pubmed',
          pmid: '8660667',
          url: 'https://pubmed.ncbi.nlm.nih.gov/8660667/',
          content: 'Experimental biochemical characterization identifies Escherichia coli ThrB as the homoserine kinase responsible for ATP-dependent O-phosphohomoserine production.',
        },
        {
          database: 'uniprot',
          url: 'https://www.uniprot.org/uniprotkb/P00547/entry',
          content: 'The reviewed UniProt record assigns EC 2.7.1.39 and the homoserine kinase product name to Escherichia coli ThrB in threonine biosynthesis.',
        },
      ],
      metadata: { searchDiagnostics: { successfulSearches: 2 } },
      annotationProposal: { target, baseRevision: 1 },
    }, parameters)).toBe(true);
  });
});
