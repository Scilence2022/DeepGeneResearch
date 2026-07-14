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
  annotationId?: string | null;
  featureType?: string | null;
  chromosome: string;
  organism?: string | null;
  locusTag?: string | null;
  geneSymbol?: string | null;
  proteinId?: string | null;
  coordinates?: { start: number; end: number; strand?: string | number | null };
  assemblyAccession?: string | null;
  assemblySha256?: string | null;
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
  status: 'draft_requires_target' | 'draft_requires_evidence' | 'ready_for_validation';
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
    /** Normalized confidence in the inclusive 0-1 range. */
    confidence: number | null;
  }>;
  operations: AnnotationOperation[];
  summary: string;
  /** Normalized confidence in the inclusive 0-1 range. */
  confidence: number | null;
  generatedAt: string;
}

export type AnnotationChangeSetProposalLike = Omit<AnnotationChangeSetProposal, 'target'> & {
  target?: Partial<GenomeTargetRef>;
};

export function assertAnnotationChangeSetProposalIntegrity(proposal: AnnotationChangeSetProposalLike): void {
  const evidenceById = new Map(proposal.evidenceManifest.sourceRecords.map(record => [record.id, record]));
  if (evidenceById.size !== proposal.evidenceManifest.sourceRecords.length) {
    throw new Error('Annotation proposal contains duplicate evidence IDs');
  }

  const claimsById = new Map(proposal.claims.map(claim => [claim.id, claim]));
  if (claimsById.size !== proposal.claims.length) {
    throw new Error('Annotation proposal contains duplicate claim IDs');
  }

  for (const claim of proposal.claims) {
    if (claim.evidenceIds.length === 0) {
      throw new Error(`Annotation claim ${claim.id} has no supporting evidence`);
    }
    for (const evidenceId of claim.evidenceIds) {
      const evidence = evidenceById.get(evidenceId);
      if (!evidence || !evidence.supporting) {
        throw new Error(`Annotation claim ${claim.id} references unsupported evidence ${evidenceId}`);
      }
    }
  }

  const referencedClaims = new Set<string>();
  for (const operation of proposal.operations) {
    if (operation.claimIds.length === 0) {
      throw new Error(`Annotation operation ${operation.op} has no evidence-backed claim`);
    }
    for (const claimId of operation.claimIds) {
      const claim = claimsById.get(claimId);
      if (!claim) {
        throw new Error(`Annotation operation ${operation.op} references unknown claim ${claimId}`);
      }
      if (claim.field !== operation.field || JSON.stringify(claim.value) !== JSON.stringify(operation.value)) {
        throw new Error(`Annotation operation ${operation.op} does not match its evidence-backed claim ${claimId}`);
      }
      referencedClaims.add(claimId);
    }
  }
  if (referencedClaims.size !== proposal.claims.length) {
    throw new Error('Annotation proposal contains claims that are not bound to an operation');
  }

  if (proposal.status === 'ready_for_validation') {
    const target = proposal.target;
    if (
      !target?.workspaceId ||
      !target.genomeId ||
      !target.featureId ||
      !target.featureHash ||
      !target.chromosome ||
      !Number.isInteger(target.annotationRevision) ||
      proposal.operations.length === 0
    ) {
      throw new Error('A ready annotation proposal requires an exact target and evidence-backed operations');
    }
  }
}
