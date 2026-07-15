import { createHash } from 'crypto';
import { assertAnnotationChangeSetProposalIntegrity } from '@/contracts/annotation-change-set';
import type {
  AnnotationChangeSetProposal,
  AnnotationOperation,
  EvidenceRecord,
  GenomeTargetRef,
} from '@/contracts/annotation-change-set';

type SourceLike = string | Record<string, any>;

export interface CodeXomicsEvidenceDetail {
  type: 'pmid' | 'doi' | 'url' | 'citation' | 'source';
  label: string;
  id?: string;
  url?: string;
  title?: string;
  database?: string;
}

export type CodeXomicsAnnotationProposal = Omit<AnnotationChangeSetProposal, 'target'> & {
  /** Compatibility fields retained for older report viewers. They are not a commit API. */
  target: Partial<GenomeTargetRef> & { geneSymbol?: string | null; organism?: string | null };
  summary: string;
  confidence: number | null;
  evidence: string[];
  evidenceDetails: CodeXomicsEvidenceDetail[];
  sources: string[];
  updates: Record<string, string | string[]>;
  ecNumbers: string[];
  goTerms: string[];
  koTerms: string[];
  pathwayTerms: string[];
  dbXrefs: string[];
  reportUrl?: string;
  detailsUrl?: string;
  generatedAt: string;
  mergeHints: {
    conservative: true;
    overwriteProduct: boolean;
    preserveExistingProduct: true;
  };
};

interface BuildProposalInput {
  geneSymbol: string;
  organism: string;
  target?: GenomeTargetRef;
  /** Existing product qualifier resolved from the exact CodeXomics target. */
  currentProduct?: string | null;
  finalReport?: string;
  sources?: SourceLike[];
  confidence?: number | null;
  reportUrl?: string;
  detailsUrl?: string;
}

type MutationField = 'product' | 'EC_number' | 'go_terms' | 'ko' | 'pathway' | 'db_xref';

interface QualifiedFieldEvidence {
  value: string;
  source: Record<string, any>;
  provenance: Record<string, any>;
}

interface QualifiedMutationCandidate {
  field: MutationField;
  value: string;
  evidence: QualifiedFieldEvidence[];
}

const AUTHORITATIVE_ANNOTATION_DATABASES = new Set([
  'biocyc',
  'ecocyc',
  'gene_ontology',
  'go',
  'kegg',
  'ncbi',
  'ncbi_gene',
  'refseq',
  'uniprot',
  'uniprotkb',
]);

const MUTATION_FIELD_DEFINITIONS: Array<{
  field: MutationField;
  annotationKey: string;
  provenanceKey: string;
}> = [
  { field: 'product', annotationKey: 'product', provenanceKey: 'product' },
  { field: 'EC_number', annotationKey: 'ecNumbers', provenanceKey: 'ecNumbers' },
  { field: 'go_terms', annotationKey: 'goTerms', provenanceKey: 'goTerms' },
  { field: 'ko', annotationKey: 'koTerms', provenanceKey: 'koTerms' },
  { field: 'pathway', annotationKey: 'pathwayTerms', provenanceKey: 'pathwayTerms' },
  { field: 'db_xref', annotationKey: 'dbXrefs', provenanceKey: 'dbXrefs' },
];

function dedupe(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const clean = String(value || '')
      .trim()
      .replace(/[),.;\]]+$/, '');

    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(clean);
  }

  return result;
}

function stripMarkdown(text: string): string {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string, maxLength: number): string {
  const clean = stripMarkdown(text);
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3).trim()}...` : clean;
}

function normalizeConfidence(confidence?: number | null): number | null {
  return typeof confidence === 'number' && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1
    ? confidence
    : null;
}

function extractSummary(reportText: string): string {
  const text = String(reportText || '');
  const sectionMatch = text.match(
    /(?:key research findings|main findings|functional summary|function(?:al)? annotation|research overview|summary)[\s\S]{0,2500}/i
  );
  const sourceText = sectionMatch ? sectionMatch[0] : text;
  const paragraphs = sourceText
    .split(/\n{2,}/)
    .map((part) => stripMarkdown(part))
    .filter((part) => part && !/^references?$/i.test(part) && part.length > 40);

  return truncate(paragraphs[0] || sourceText, 900);
}

function sourceToText(source: SourceLike): string {
  if (!source) return '';
  if (typeof source === 'string') return source;

  return [
    source.title,
    source.content,
    source.abstract,
    source.summary,
    source.formattedCitation,
    source.url,
    source.database,
    Array.isArray(source.evidence) ? source.evidence.join(' ') : source.evidence,
    source.annotation ? JSON.stringify(source.annotation) : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function addEvidenceDetail(details: CodeXomicsEvidenceDetail[], detail: CodeXomicsEvidenceDetail) {
  if (!detail.label) return;
  const exists = details.some((item) => item.label.toLowerCase() === detail.label.toLowerCase());
  if (!exists) details.push(detail);
}

function extractEvidenceFromText(text: string): CodeXomicsEvidenceDetail[] {
  const details: CodeXomicsEvidenceDetail[] = [];
  const sourceText = String(text || '');

  for (const match of sourceText.matchAll(/\bPMID[:\s]*(\d{6,10})\b/gi)) {
    addEvidenceDetail(details, {
      type: 'pmid',
      id: match[1],
      label: `PMID:${match[1]}`,
      url: `https://pubmed.ncbi.nlm.nih.gov/${match[1]}/`,
    });
  }

  for (const match of sourceText.matchAll(/\b(?:DOI[:\s]*)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)\b/gi)) {
    const doi = match[1].replace(/[),.;\]]+$/, '');
    addEvidenceDetail(details, {
      type: 'doi',
      id: doi,
      label: `DOI:${doi}`,
      url: `https://doi.org/${doi}`,
    });
  }

  for (const match of sourceText.matchAll(/https?:\/\/[^\s<>)\]]+/gi)) {
    const url = match[0].replace(/[),.;\]]+$/, '');
    addEvidenceDetail(details, {
      type: 'url',
      label: url,
      url,
    });
  }

  return details;
}

function extractEvidenceFromSources(sources: SourceLike[]): CodeXomicsEvidenceDetail[] {
  const details: CodeXomicsEvidenceDetail[] = [];

  for (const source of sources || []) {
    const text = sourceToText(source);
    for (const detail of extractEvidenceFromText(text)) {
      addEvidenceDetail(details, detail);
    }

    if (!source || typeof source === 'string') {
      if (source && details.length === 0) {
        addEvidenceDetail(details, {
          type: 'source',
          label: truncate(source, 220),
        });
      }
      continue;
    }

    if (source.pmid) {
      const pmid = String(source.pmid);
      addEvidenceDetail(details, {
        type: 'pmid',
        id: pmid,
        label: `PMID:${pmid}`,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        title: source.title,
        database: source.database,
      });
    }

    if (source.doi) {
      const doi = String(source.doi).replace(/[),.;\]]+$/, '');
      addEvidenceDetail(details, {
        type: 'doi',
        id: doi,
        label: `DOI:${doi}`,
        url: `https://doi.org/${doi}`,
        title: source.title,
        database: source.database,
      });
    }

    if (source.url) {
      const label = source.title ? `${source.title} - ${source.url}` : String(source.url);
      addEvidenceDetail(details, {
        type: 'url',
        label,
        url: source.url,
        title: source.title,
        database: source.database,
      });
    } else if (source.formattedCitation || source.title) {
      addEvidenceDetail(details, {
        type: 'citation',
        label: truncate(source.formattedCitation || source.title, 260),
        title: source.title,
        database: source.database,
      });
    }
  }

  return details.slice(0, 30);
}

function findEvidenceSourcePayload(detail: CodeXomicsEvidenceDetail, sources: SourceLike[]): string {
  const identifiers = dedupe([detail.id, detail.url, detail.label]).map(value => value.toLowerCase());
  for (const source of sources) {
    const sourceText = sourceToText(source);
    if (!sourceText) continue;

    if (source && typeof source === 'object') {
      const sourceIdentifiers = dedupe([
        source.pmid ? `PMID:${source.pmid}` : null,
        source.pmid ? String(source.pmid) : null,
        source.doi ? `DOI:${source.doi}` : null,
        source.doi ? String(source.doi) : null,
        source.url,
      ]).map(value => value.toLowerCase());
      if (identifiers.some(identifier => sourceIdentifiers.includes(identifier))) {
        return sourceText;
      }
    }

    const lowerSourceText = sourceText.toLowerCase();
    if (identifiers.some(identifier => lowerSourceText.includes(identifier))) {
      return sourceText;
    }
  }
  return '';
}

function normalizeComparable(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeDatabase(value: unknown): string {
  return normalizeComparable(value).replace(/[\s-]+/g, '_');
}

function normalizeUrl(value: unknown): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

function asValues(value: unknown): string[] {
  return dedupe((Array.isArray(value) ? value : [value]).map(item => String(item || '')));
}

function sourceTargetsExactFeature(source: Record<string, any>, target: GenomeTargetRef): boolean {
  if (source.targetMatch !== true) return false;
  const sourceTarget = source.target || source.targetRef || source.annotation?.target;
  if (!sourceTarget || typeof sourceTarget !== 'object') return false;

  return (['workspaceId', 'genomeId', 'annotationRevision', 'featureId', 'featureHash', 'chromosome'] as const)
    .every(key => String(sourceTarget[key]) === String(target[key]));
}

function getFieldProvenance(annotation: Record<string, any>, key: string): Record<string, any>[] {
  const container = annotation.fieldEvidence || annotation.provenance;
  const value = container?.[key];
  if (!value) return [];
  return (Array.isArray(value) ? value : [value])
    .filter(item => Boolean(item && typeof item === 'object'));
}

function isQualifiedFieldProvenance({
  field,
  value,
  source,
  provenance,
  currentProduct,
}: {
  field: MutationField;
  value: string;
  source: Record<string, any>;
  provenance: Record<string, any>;
  currentProduct?: string | null;
}): boolean {
  const database = normalizeDatabase(source.database);
  if (
    normalizeComparable(provenance.value) !== normalizeComparable(value)
    || normalizeComparable(provenance.sourceId) !== normalizeComparable(source.sourceId)
    || normalizeDatabase(provenance.database) !== database
    || normalizeUrl(provenance.url) !== normalizeUrl(source.url)
  ) {
    return false;
  }

  if (field !== 'product') return true;
  const existingProduct = String(currentProduct || '').trim();
  if (!existingProduct || normalizeComparable(existingProduct) === normalizeComparable(value)) return false;

  return normalizeComparable(provenance.currentValue) === normalizeComparable(existingProduct)
    && String(provenance.justification || '').trim().length >= 10;
}

function collectQualifiedMutationCandidates(
  sources: SourceLike[],
  target: GenomeTargetRef | undefined,
  currentProduct?: string | null
): QualifiedMutationCandidate[] {
  if (!target) return [];
  const candidates = new Map<string, QualifiedMutationCandidate>();

  for (const source of sources) {
    if (!source || typeof source === 'string') continue;
    const database = normalizeDatabase(source.database);
    if (
      source.authoritative !== true
      || !AUTHORITATIVE_ANNOTATION_DATABASES.has(database)
      || !source.sourceId
      || !source.url
      || !source.annotation
      || typeof source.annotation !== 'object'
      || !sourceTargetsExactFeature(source, target)
    ) {
      continue;
    }

    for (const definition of MUTATION_FIELD_DEFINITIONS) {
      const values = asValues(source.annotation[definition.annotationKey]);
      const provenanceEntries = getFieldProvenance(source.annotation, definition.provenanceKey);
      for (const value of values) {
        const qualifiedEvidence = provenanceEntries
          .filter(provenance => isQualifiedFieldProvenance({
            field: definition.field,
            value,
            source,
            provenance,
            currentProduct,
          }))
          .map(provenance => ({ value, source, provenance }));
        if (qualifiedEvidence.length === 0) continue;

        const key = `${definition.field}:${normalizeComparable(value)}`;
        const existing = candidates.get(key);
        if (existing) {
          existing.evidence.push(...qualifiedEvidence);
        } else {
          candidates.set(key, {
            field: definition.field,
            value,
            evidence: qualifiedEvidence,
          });
        }
      }
    }
  }

  return Array.from(candidates.values());
}

export function buildCodeXomicsAnnotationProposal(input: BuildProposalInput): CodeXomicsAnnotationProposal {
  const finalReport = input.finalReport || '';
  const sources = input.sources || [];
  const summary = extractSummary(finalReport);
  // Prioritize authoritative structured records so a long literature list
  // cannot crowd the exact UniProt/KEGG identity record out of the bounded
  // annotation manifest.
  const orderedSources = [...sources].sort((left, right) => {
    const rank = (source: SourceLike) => {
      if (!source || typeof source === 'string') return 0;
      if (source.annotation?.reviewed) return 3;
      if (source.annotation) return 2;
      return source.database === 'pubmed' ? 1 : 0;
    };
    return rank(right) - rank(left);
  });
  const evidenceDetails = extractEvidenceFromSources(orderedSources);
  for (const detail of extractEvidenceFromText(finalReport)) {
    addEvidenceDetail(evidenceDetails, detail);
  }
  evidenceDetails.splice(30);

  const generatedAt = new Date().toISOString();
  const confidence = normalizeConfidence(input.confidence);
  const evidenceSourcePayloads = evidenceDetails.map(detail => findEvidenceSourcePayload(detail, sources));
  const sourceRecords: EvidenceRecord[] = evidenceDetails.map((detail, index) => {
    const type = detail.type === 'source' ? 'citation' : detail.type;
    const sourceId = detail.id || detail.url || detail.label;
    return {
      id: `evidence_${index + 1}`,
      type,
      label: detail.label,
      sourceId,
      url: detail.url,
      database: detail.database,
      retrievedAt: generatedAt,
      // Bind the manifest to the retrieved source payload when available, not
      // merely to its citation label. This lets downstream audit detect source
      // content changes while retaining citation-only evidence records.
      sourceHash: createHash('sha256')
        .update(JSON.stringify({ detail, sourcePayload: evidenceSourcePayloads[index] }))
        .digest('hex'),
      // Report text, citations, and unstructured retrieval payloads are useful
      // audit context but can never authorize an annotation mutation.
      supporting: false,
    };
  });
  const qualifiedCandidates = collectQualifiedMutationCandidates(sources, input.target, input.currentProduct);
  const claims: AnnotationChangeSetProposal['claims'] = [];
  const operations: AnnotationOperation[] = [];
  const updates: Record<string, string | string[]> = {};
  for (const candidate of qualifiedCandidates) {
    const evidenceIds = candidate.evidence.map(({ source, provenance }) => {
      const id = `evidence_${sourceRecords.length + 1}`;
      sourceRecords.push({
        id,
        type: 'database',
        label: `${provenance.sourceId} ${candidate.field}=${candidate.value}`,
        sourceId: String(provenance.sourceId),
        url: String(provenance.url),
        database: String(provenance.database),
        retrievedAt: typeof provenance.retrievedAt === 'string' ? provenance.retrievedAt : generatedAt,
        sourceHash: createHash('sha256')
          .update(JSON.stringify({
            field: candidate.field,
            value: candidate.value,
            target: input.target,
            source: {
              sourceId: source.sourceId,
              database: source.database,
              url: source.url,
              targetMatch: source.targetMatch,
              target: source.target || source.targetRef || source.annotation?.target,
              annotation: source.annotation,
            },
            provenance,
          }))
          .digest('hex'),
        supporting: true,
      });
      return id;
    });

    const claim = {
      id: `claim_${claims.length + 1}`,
      field: candidate.field,
      value: candidate.value,
      evidenceIds,
      confidence,
    };
    claims.push(claim);
    operations.push({
      op: candidate.field === 'product'
        ? 'replaceQualifier'
        : candidate.field === 'db_xref'
          ? 'addDbxref'
          : 'addQualifier',
      field: candidate.field,
      value: candidate.value,
      claimIds: [claim.id],
    });

    if (candidate.field === 'product') {
      updates.product = candidate.value;
    } else {
      const existing = Array.isArray(updates[candidate.field]) ? updates[candidate.field] as string[] : [];
      updates[candidate.field] = dedupe([...existing, candidate.value]);
    }
  }

  const valuesFor = (field: MutationField) => qualifiedCandidates
    .filter(candidate => candidate.field === field)
    .map(candidate => candidate.value);
  const ecNumbers = valuesFor('EC_number');
  const goTerms = valuesFor('go_terms');
  const koTerms = valuesFor('ko');
  const pathwayTerms = valuesFor('pathway');
  const dbXrefs = valuesFor('db_xref');
  const evidence = dedupe([
    ...evidenceDetails.map(detail => detail.label),
    ...sourceRecords.filter(record => record.supporting).map(record => record.label),
  ]).slice(0, 30);

  const proposal: CodeXomicsAnnotationProposal = {
    schema: 'codexomics.annotation-change-set.v2',
    status: !input.target
      ? 'draft_requires_target'
      : operations.length > 0
        ? 'ready_for_validation'
        : 'draft_requires_evidence',
    // An exact CodeXomics target is immutable provenance. The research query's
    // display symbol must never overwrite the symbol resolved by CodeXomics.
    target: input.target ? { ...input.target } : { geneSymbol: input.geneSymbol, organism: input.organism },
    baseRevision: input.target?.annotationRevision,
    evidenceManifest: {
      schema: 'dgr.evidence-manifest.v1',
      generatedAt,
      pipelineVersion: process.env.npm_package_version || '0.22.0',
      sourceRecords,
    },
    claims,
    operations,
    summary,
    confidence,
    evidence,
    evidenceDetails,
    sources: evidence,
    updates,
    ecNumbers,
    goTerms,
    koTerms,
    pathwayTerms,
    dbXrefs,
    reportUrl: input.reportUrl,
    detailsUrl: input.detailsUrl,
    generatedAt,
    mergeHints: {
      conservative: true,
      overwriteProduct: Boolean(updates.product),
      preserveExistingProduct: true,
    },
  };
  assertAnnotationChangeSetProposalIntegrity(proposal);
  return proposal;
}
