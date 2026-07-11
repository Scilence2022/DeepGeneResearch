/**
 * Shared wire contract for Deep Gene Research -> CodeXomics autonomous
 * annotation workflows. CodeXomics is the sole commit authority; DGR emits a
 * proposal and immutable evidence manifest only.
 */
export interface GenomeTargetRef {
  workspaceId: string;
  genomeId: string;
  annotationRevision: number;
  featureId: string;
  featureHash: string;
  chromosome: string;
  locusTag?: string | null;
  geneSymbol?: string | null;
  proteinId?: string | null;
  coordinates?: { start: number; end: number; strand?: string | number | null };
  assemblyAccession?: string | null;
  taxonId?: string | number | null;
  proteinSha256?: string | null;
}

export interface EvidenceRecord {
  id: string;
  type: 'pmid' | 'doi' | 'url' | 'database' | 'citation';
  label: string;
  sourceId?: string;
  url?: string;
  database?: string;
  retrievedAt: string;
  sourceHash: string;
  supporting: boolean;
}

export type AnnotationOperation = {
  op: 'addQualifier' | 'replaceQualifier' | 'removeQualifier' | 'addDbxref' | 'addEvidenceLink';
  field?: string;
  value?: string | string[];
  claimIds: string[];
};

export interface AnnotationChangeSetProposal {
  schema: 'codexomics.annotation-change-set.v2';
  status: 'draft_requires_target' | 'ready_for_validation';
  target?: GenomeTargetRef;
  baseRevision?: number;
  evidenceManifest: {
    schema: 'dgr.evidence-manifest.v1';
    generatedAt: string;
    pipelineVersion: string;
    sourceRecords: EvidenceRecord[];
  };
  claims: Array<{
    id: string;
    field: string;
    value: string | string[];
    evidenceIds: string[];
    confidence: number | null;
  }>;
  operations: AnnotationOperation[];
  summary: string;
  confidence: number | null;
  generatedAt: string;
}
