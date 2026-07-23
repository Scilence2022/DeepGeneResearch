import { createHash } from 'crypto';
import { assertAnnotationChangeSetProposalIntegrity } from '@/contracts/annotation-change-set';
import type {
  AnnotationChangeSetProposal,
  AnnotationOperation,
  CurrentAnnotationSnapshot,
  EvidenceRecord,
  GenomeTargetRef,
} from '@/contracts/annotation-change-set';
import {
  canonicalizePubMedAbstract,
  extractCitationBoundLiteratureFindings,
  PUBMED_ABSTRACT_CANONICALIZATION,
  PUBMED_ABSTRACT_OFFSET_ENCODING,
} from './literature-findings';
import { FULL_TEXT_CANONICALIZATION, FULL_TEXT_OFFSET_ENCODING } from './full-text';
import {
  currentAnnotationHasValue,
  isMoreSpecificProduct,
} from './current-annotation';

type SourceLike = string | Record<string, any>;

export interface CodeXomicsEvidenceDetail {
  type: 'pmid' | 'doi' | 'url' | 'citation' | 'source';
  label: string;
  id?: string;
  url?: string;
  title?: string;
  database?: string;
  identifiers?: Array<{
    scheme: 'pmid' | 'doi';
    value: string;
  }>;
}

export interface CodeXomicsResearchFact {
  id: string;
  category: 'identity' | 'function' | 'protein' | 'structure' | 'pathway' | 'localization' | 'regulation' | 'expression' | 'interaction' | 'phenotype' | 'evolution' | 'cross_reference';
  field: string;
  value: string | number | string[];
  statement: string;
  evidenceIds: string[];
  confidence: number | null;
  directness: 'exact_target';
  evidenceLevel: 'reviewed_database' | 'authoritative_database' | 'target_literature';
  sourceDatabases: string[];
  citation?: {
    type: 'pmid';
    id: string;
    label: string;
    url: string;
    title: string;
    year?: number;
    doi?: string;
  };
  literatureBasis?: {
    kind: 'pubmed_abstract_span';
    evidenceId: string;
    pmid: string;
    doi?: string;
    excerpt: string;
    excerptSha256: string;
    hashEncoding: 'utf8';
    excerptStart: number;
    excerptEnd: number;
    abstractSha256: string;
    abstractLength: number;
    canonicalization: typeof PUBMED_ABSTRACT_CANONICALIZATION;
    offsetEncoding: typeof PUBMED_ABSTRACT_OFFSET_ENCODING;
  } | {
    kind: 'full_text_span';
    evidenceId: string;
    pmid: string;
    doi?: string;
    documentSha256: string;
    sourceOrigin: 'user_upload' | 'pmc_xml';
    excerpt: string;
    excerptSha256: string;
    hashEncoding: 'utf8';
    excerptStart: number;
    excerptEnd: number;
    textSha256: string;
    textLength: number;
    pageNumber?: number;
    canonicalization: typeof FULL_TEXT_CANONICALIZATION;
    offsetEncoding: typeof FULL_TEXT_OFFSET_ENCODING;
  };
}

export interface CodeXomicsLiteratureHighlight {
  title: string;
  pmid?: string;
  doi?: string;
  year?: number;
  url: string;
  relevance: 'high' | 'medium';
  relevanceReason: string;
  evidenceIds: string[];
}

export interface CodeXomicsCurationNoteSegment {
  category: CodeXomicsResearchFact['category'];
  text: string;
  factIds: string[];
  evidenceIds: string[];
  citations: Array<{
    type: 'pmid';
    id: string;
    label: string;
    url: string;
  }>;
}

export interface CodeXomicsCurationNote {
  schema: 'dgr.curation-note.v1';
  text: string;
  textSha256: string;
  segments: CodeXomicsCurationNoteSegment[];
  factIds: string[];
  evidenceIds: string[];
  coverage: {
    availableFactCount: number;
    includedFactCount: number;
    includedCategories: CodeXomicsResearchFact['category'][];
    omittedFactIds: string[];
  };
}

export type CodeXomicsAnnotationProposal = Omit<AnnotationChangeSetProposal, 'target'> & {
  /** Compatibility fields retained for older report viewers. They are not a commit API. */
  target: Partial<GenomeTargetRef> & { geneSymbol?: string | null; organism?: string | null };
  summary: string;
  confidence: number | null;
  evidence: string[];
  evidenceDetails: CodeXomicsEvidenceDetail[];
  sources: string[];
  /** Concise, citation-linked facts for curator review; these are not mutation operations. */
  researchSummary: {
    schema: 'dgr.curation-summary.v1';
    headline: string;
    facts: CodeXomicsResearchFact[];
    literature: CodeXomicsLiteratureHighlight[];
    limitations: string[];
  };
  /** Reviewable annotation /note text derived only from exact-target facts above. */
  curationNote?: CodeXomicsCurationNote;
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
  /** Existing scientific qualifiers resolved from the exact CodeXomics target. */
  currentAnnotation?: CurrentAnnotationSnapshot;
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

function evidenceIdentityKeys(value: {
  id?: string;
  sourceId?: string;
  url?: string;
  label?: string;
  identifiers?: Array<{ scheme: string; value: string }>;
}): Set<string> {
  const keys = new Set<string>();
  for (const identifier of value.identifiers || []) {
    const scheme = String(identifier?.scheme || '').trim().toLowerCase();
    const identifierValue = String(identifier?.value || '').trim().replace(/[),.;\]]+$/, '').toLowerCase();
    if (scheme && identifierValue) keys.add(`${scheme}:${identifierValue}`);
  }

  for (const candidate of [value.id, value.sourceId, value.url, value.label]) {
    const clean = String(candidate || '').trim().replace(/[),.;\]]+$/, '');
    if (!clean) continue;
    keys.add(`raw:${clean.toLowerCase()}`);

    const pmid = clean.match(/(?:\bPMID\s*:?\s*|pubmed\.ncbi\.nlm\.nih\.gov\/)(\d{5,10})(?:\/|\b)/i)?.[1]
      || (/^\d{5,10}$/.test(clean) ? clean : undefined);
    if (pmid) keys.add(`pmid:${pmid}`);

    const doi = clean.match(/(?:\bDOI\s*:?\s*|doi\.org\/)(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i)?.[1];
    if (doi) keys.add(`doi:${doi.replace(/[),.;\]]+$/, '').toLowerCase()}`);

    if (/^https?:\/\//i.test(clean)) {
      try {
        const parsed = new URL(clean);
        parsed.hash = '';
        parsed.search = '';
        parsed.hostname = parsed.hostname.toLowerCase();
        parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
        keys.add(`url:${parsed.toString().replace(/\/$/, '').toLowerCase()}`);
      } catch (_error) {
        // The raw key above still gives malformed-but-identical values exact matching.
      }
    }
  }
  return keys;
}

function addEvidenceDetail(details: CodeXomicsEvidenceDetail[], detail: CodeXomicsEvidenceDetail) {
  if (!detail.label) return;
  const detailKeys = evidenceIdentityKeys(detail);
  const existing = details.find(item => {
    const itemKeys = evidenceIdentityKeys(item);
    return Array.from(detailKeys).some(key => itemKeys.has(key));
  });
  if (!existing) {
    details.push(detail);
    return;
  }

  existing.id ||= detail.id;
  existing.url ||= detail.url;
  existing.title ||= detail.title;
  existing.database ||= detail.database;
  const identifiers = [...(existing.identifiers || []), ...(detail.identifiers || [])];
  existing.identifiers = identifiers.filter((identifier, index) =>
    identifiers.findIndex(candidate =>
      candidate.scheme.toLowerCase() === identifier.scheme.toLowerCase()
      && candidate.value.toLowerCase() === identifier.value.toLowerCase()
    ) === index
  );
  if (existing.identifiers.length === 0) delete existing.identifiers;
}

function extractEvidenceFromText(text: string): CodeXomicsEvidenceDetail[] {
  const details: CodeXomicsEvidenceDetail[] = [];
  const sourceText = String(text || '');

  for (const match of sourceText.matchAll(/\bPMID[:\s]*(\d{5,10})\b/gi)) {
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
    if (!source || typeof source === 'string') {
      for (const detail of extractEvidenceFromText(String(source || ''))) addEvidenceDetail(details, detail);
      if (source && !/^https?:|^PMID:|^DOI:/i.test(source)) {
        addEvidenceDetail(details, {
          type: 'source',
          label: truncate(source, 220),
        });
      }
      continue;
    }

    const literatureReference = source.structuredData?.literatureReferences?.[0];
    const pmidValue = source.pmid || literatureReference?.pmid || source.provenance?.provider === 'pubmed' && source.provenance?.recordId;
    const doiValue = source.doi || literatureReference?.doi;
    if (pmidValue) {
      const pmid = String(pmidValue);
      const doi = doiValue ? String(doiValue).replace(/[),.;\]]+$/, '') : undefined;
      addEvidenceDetail(details, {
        type: 'pmid',
        id: pmid,
        label: `PMID:${pmid}`,
        url: source.url || `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        title: source.title,
        database: source.database,
        identifiers: [
          { scheme: 'pmid', value: pmid },
          ...(doi ? [{ scheme: 'doi' as const, value: doi }] : []),
        ],
      });
    }

    if (doiValue && !pmidValue) {
      const doi = String(doiValue).replace(/[),.;\]]+$/, '');
      addEvidenceDetail(details, {
        type: 'doi',
        id: doi,
        label: `DOI:${doi}`,
        url: `https://doi.org/${doi}`,
        title: source.title,
        database: source.database,
      });
    }

    if (source.url && !pmidValue && !doiValue) {
      const label = source.title ? `${source.title} - ${source.url}` : String(source.url);
      addEvidenceDetail(details, {
        type: 'url',
        label,
        url: source.url,
        title: source.title,
        database: source.database,
      });
    } else if (!pmidValue && !doiValue && (source.formattedCitation || source.title)) {
      addEvidenceDetail(details, {
        type: 'citation',
        label: truncate(source.formattedCitation || source.title, 260),
        title: source.title,
        database: source.database,
      });
    }
  }

  return details.slice(0, 100);
}

function evidenceIdsForSource(source: Record<string, any>, records: EvidenceRecord[]): string[] {
  const literatureReference = source.structuredData?.literatureReferences?.[0];
  const sourceKeys = evidenceIdentityKeys({
    id: source.pmid || literatureReference?.pmid || source.provenance?.recordId,
    sourceId: source.sourceId,
    url: source.url,
    label: source.doi || literatureReference?.doi,
    identifiers: [
      ...(source.pmid || literatureReference?.pmid || source.provenance?.provider === 'pubmed' && source.provenance?.recordId
        ? [{ scheme: 'pmid', value: String(source.pmid || literatureReference?.pmid || source.provenance?.recordId) }]
        : []),
      ...(source.doi || literatureReference?.doi
        ? [{ scheme: 'doi', value: String(source.doi || literatureReference?.doi) }]
        : []),
    ],
  });
  return records
    .filter(record => Array.from(evidenceIdentityKeys(record)).some(key => sourceKeys.has(key)))
    .map(record => record.id)
    .slice(0, 4);
}

function buildResearchSummary(
  input: BuildProposalInput,
  sources: SourceLike[],
  records: EvidenceRecord[],
  confidence: number | null,
  fallbackSummary: string,
): CodeXomicsAnnotationProposal['researchSummary'] {
  const facts: CodeXomicsResearchFact[] = [];
  const factsByKey = new Map<string, CodeXomicsResearchFact>();
  const addFact = (
    source: Record<string, any>,
    category: CodeXomicsResearchFact['category'],
    field: string,
    value: unknown,
  ) => {
    if (value === undefined || value === null || value === '') return;
    const normalizeFactValue = (item: unknown): string | number => {
      if (typeof item === 'number') return item;
      if (typeof item === 'string') return item.trim();
      return truncate(JSON.stringify(item), 500);
    };
    const normalizedValue = Array.isArray(value)
      ? value.filter(Boolean).map(normalizeFactValue).filter(Boolean)
      : normalizeFactValue(value);
    if (Array.isArray(normalizedValue) && normalizedValue.length === 0) return;
    const key = `${category}:${field}:${JSON.stringify(normalizedValue)}`.toLowerCase();
    const evidenceIds = evidenceIdsForSource(source, records);
    if (evidenceIds.length === 0) return;
    const existing = factsByKey.get(key);
    if (existing) {
      existing.evidenceIds = dedupe([...existing.evidenceIds, ...evidenceIds]);
      existing.sourceDatabases = dedupe([...existing.sourceDatabases, String(source.database || 'unknown')]);
      if (source.annotation?.reviewed) existing.evidenceLevel = 'reviewed_database';
      const sourceConfidence = normalizeConfidence(source.confidence) ?? confidence;
      if (sourceConfidence !== null && (existing.confidence === null || sourceConfidence > existing.confidence)) {
        existing.confidence = sourceConfidence;
      }
      return;
    }
    const fact: CodeXomicsResearchFact = {
      id: `fact_${facts.length + 1}`,
      category,
      field,
      value: normalizedValue as string | number | string[],
      statement: `${field.replace(/_/g, ' ')}: ${Array.isArray(normalizedValue) ? normalizedValue.join('; ') : normalizedValue}`,
      evidenceIds,
      confidence: normalizeConfidence(source.confidence) ?? confidence,
      directness: 'exact_target',
      evidenceLevel: source.annotation?.reviewed ? 'reviewed_database' : 'authoritative_database',
      sourceDatabases: [String(source.database || 'unknown')],
    };
    factsByKey.set(key, fact);
    facts.push(fact);
  };

  for (const source of sources) {
    if (!source || typeof source === 'string' || source.authoritative !== true || source.targetMatch !== true) continue;
    const basic = source.structuredData?.geneBasicInfo || {};
    const functional = source.structuredData?.functionalData || {};
    const protein = source.structuredData?.proteinInfo || {};
    addFact(source, 'identity', 'gene_symbol', basic.geneSymbol || input.target?.geneSymbol || input.geneSymbol);
    addFact(source, 'identity', 'locus_tag', input.target?.locusTag);
    addFact(source, 'identity', 'organism', basic.organism || input.target?.organism || input.organism);
    addFact(source, 'identity', 'gene_id', basic.geneID);
    addFact(source, 'identity', 'alternative_names', basic.alternativeNames);
    addFact(source, 'identity', 'product', source.annotation?.product || protein.proteinName);
    addFact(source, 'function', 'molecular_function', functional.molecularFunction);
    addFact(source, 'function', 'catalytic_activity', functional.catalyticActivity || protein.catalyticActivity);
    addFact(source, 'function', 'enzyme_classification', source.annotation?.ecNumbers || functional.enzymeClassification);
    addFact(source, 'pathway', 'biological_process', functional.biologicalProcess);
    addFact(source, 'pathway', 'go_terms', source.annotation?.goTerms);
    addFact(source, 'pathway', 'pathway_identifiers', source.annotation?.pathwayTerms);
    addFact(source, 'localization', 'cellular_component', functional.cellularComponent);
    addFact(source, 'localization', 'subcellular_location', protein.subcellularLocation);
    addFact(source, 'protein', 'uniprot_id', protein.uniprotId);
    addFact(source, 'protein', 'length_aa', protein.proteinSize);
    addFact(source, 'protein', 'molecular_weight_da', protein.molecularWeight);
    addFact(source, 'protein', 'family_or_domains', protein.proteinDomains);
    addFact(source, 'structure', 'structure_cross_references', (source.annotation?.dbXrefs || []).filter((value: string) => /^PDB:/i.test(value)));
    addFact(source, 'regulation', 'regulatory_mechanisms', source.structuredData?.regulatoryAnalysis || source.structuredData?.expressionData?.regulation);
    addFact(source, 'expression', 'expression', source.structuredData?.expressionData?.environmentalResponse);
    addFact(source, 'interaction', 'protein_interactions', source.structuredData?.interactionData?.proteinInteractions);
    addFact(source, 'phenotype', 'phenotypes', source.structuredData?.phenotypeData || source.structuredData?.diseaseData);
    addFact(source, 'evolution', 'gene_family', source.structuredData?.evolutionaryData?.geneFamily);
    addFact(source, 'evolution', 'conservation', source.structuredData?.evolutionaryData?.conservation?.overallConservation);
    addFact(source, 'cross_reference', 'database_cross_references', source.annotation?.dbXrefs);
  }

  const identityTerms = sources.flatMap(source => {
    if (!source || typeof source === 'string' || source.authoritative !== true || source.targetMatch !== true) return [];
    const basic = source.structuredData?.geneBasicInfo || {};
    const protein = source.structuredData?.proteinInfo || {};
    return [
      source.sourceId,
      basic.geneID,
      ...(Array.isArray(basic.alternativeNames) ? basic.alternativeNames : [basic.alternativeNames]),
      source.annotation?.product,
      protein.proteinName,
      protein.uniprotId,
    ].filter(Boolean).map(String);
  });
  const literatureFindings = extractCitationBoundLiteratureFindings(
    sources.filter((source): source is Record<string, any> => Boolean(source && typeof source === 'object')),
    {
      geneSymbol: input.target?.geneSymbol || input.geneSymbol,
      organism: input.target?.organism || input.organism,
      locusTag: input.target?.locusTag,
      proteinId: input.target?.proteinId,
      identityTerms,
    },
    18,
  );
  for (const finding of literatureFindings) {
    const evidenceIds = evidenceIdsForSource(finding.source, records);
    const evidenceRecord = records.find(record =>
      evidenceIds.includes(record.id)
      && record.sourceBinding?.content.canonicalization === PUBMED_ABSTRACT_CANONICALIZATION
    );
    if (
      !evidenceRecord?.sourceBinding
      || evidenceRecord.sourceBinding.selector.identifier.value !== finding.pmid
      || evidenceRecord.sourceBinding.content.sha256 !== finding.abstractSha256
      || evidenceRecord.sourceBinding.content.length !== finding.abstractLength
    ) {
      continue;
    }
    const key = `literature:${finding.category}:${finding.pmid}:${finding.statement}`.toLowerCase();
    if (factsByKey.has(key)) continue;
    const fact: CodeXomicsResearchFact = {
      id: `fact_${facts.length + 1}`,
      category: finding.category,
      field: 'literature_finding',
      value: finding.statement,
      statement: finding.statement,
      evidenceIds: [evidenceRecord.id],
      // Retrieval relevance is not scientific confidence. Preserve the
      // abstract statement without manufacturing a quantitative certainty.
      confidence: null,
      directness: 'exact_target',
      evidenceLevel: 'target_literature',
      sourceDatabases: ['pubmed'],
      citation: {
        type: 'pmid',
        id: finding.pmid,
        label: `PMID:${finding.pmid}`,
        url: finding.url,
        title: finding.title,
        year: finding.year,
        doi: finding.doi,
      },
      literatureBasis: {
        kind: 'pubmed_abstract_span',
        evidenceId: evidenceRecord.id,
        pmid: finding.pmid,
        doi: finding.doi,
        excerpt: finding.statement,
        excerptSha256: createHash('sha256').update(finding.statement).digest('hex'),
        hashEncoding: 'utf8',
        excerptStart: finding.excerptStart,
        excerptEnd: finding.excerptEnd,
        abstractSha256: finding.abstractSha256,
        abstractLength: finding.abstractLength,
        canonicalization: finding.canonicalization,
        offsetEncoding: finding.offsetEncoding,
      },
    };
    factsByKey.set(key, fact);
    facts.push(fact);
  }

  let fullTextFactCount = 0;
  for (const source of sources) {
    if (!source || typeof source === 'string' || fullTextFactCount >= 18) continue;
    const fullText = source.fullText;
    const spans = Array.isArray(source.fullTextEvidence) ? source.fullTextEvidence : [];
    const pmid = String(
      source.pmid
      || source.structuredData?.literatureReferences?.[0]?.pmid
      || fullText?.identifiers?.pmid
      || '',
    ).trim();
    if (fullText?.schema !== 'dgr.full-text-document.v1' || !/^\d{5,10}$/.test(pmid)) continue;
    const evidenceIds = evidenceIdsForSource(source, records);
    const evidenceRecord = records.find(record =>
      evidenceIds.includes(record.id)
      && record.sourceBinding?.content.canonicalization === FULL_TEXT_CANONICALIZATION
      && record.sourceBinding.content.sha256 === fullText.textSha256
      && record.sourceBinding.content.length === fullText.textLength
    );
    if (!evidenceRecord) continue;
    const doi = String(
      source.doi
      || source.structuredData?.literatureReferences?.[0]?.doi
      || fullText.identifiers?.doi
      || '',
    ).trim() || undefined;
    for (const span of spans) {
      if (fullTextFactCount >= 18) break;
      if (
        span?.kind !== 'full_text_span'
        || span.textSha256 !== fullText.textSha256
        || span.textLength !== fullText.textLength
        || !Number.isSafeInteger(span.excerptStart)
        || !Number.isSafeInteger(span.excerptEnd)
        || span.excerptStart < 0
        || span.excerptEnd <= span.excerptStart
        || fullText.text.slice(span.excerptStart, span.excerptEnd) !== span.excerpt
        || createHash('sha256').update(span.excerpt).digest('hex') !== span.excerptSha256
      ) {
        continue;
      }
      const key = `full_text:${span.category}:${pmid}:${span.excerpt}`.toLowerCase();
      if (factsByKey.has(key)) continue;
      const fact: CodeXomicsResearchFact = {
        id: `fact_${facts.length + 1}`,
        category: span.category,
        field: 'literature_finding',
        value: span.excerpt,
        statement: span.excerpt,
        evidenceIds: [evidenceRecord.id],
        confidence: null,
        directness: 'exact_target',
        evidenceLevel: 'target_literature',
        sourceDatabases: [String(source.database || 'user_document')],
        citation: {
          type: 'pmid',
          id: pmid,
          label: `PMID:${pmid}`,
          url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
          title: String(source.title || fullText.name || `PubMed article ${pmid}`),
          doi,
        },
        literatureBasis: {
          kind: 'full_text_span',
          evidenceId: evidenceRecord.id,
          pmid,
          doi,
          documentSha256: String(fullText.documentSha256),
          sourceOrigin: fullText.origin,
          excerpt: span.excerpt,
          excerptSha256: span.excerptSha256,
          hashEncoding: 'utf8',
          excerptStart: span.excerptStart,
          excerptEnd: span.excerptEnd,
          textSha256: fullText.textSha256,
          textLength: fullText.textLength,
          pageNumber: span.pageNumber,
          canonicalization: FULL_TEXT_CANONICALIZATION,
          offsetEncoding: FULL_TEXT_OFFSET_ENCODING,
        },
      };
      factsByKey.set(key, fact);
      facts.push(fact);
      fullTextFactCount += 1;
    }
  }

  const literature: CodeXomicsLiteratureHighlight[] = [];
  for (const source of sources) {
    if (!source || typeof source === 'string' || source.database !== 'pubmed') continue;
    const relevance = source.structuredData?.targetRelevance;
    if (relevance?.accepted !== true || relevance?.directness !== 'direct') continue;
    const reference = source.structuredData?.literatureReferences?.[0] || {};
    const evidenceIds = evidenceIdsForSource(source, records);
    if (evidenceIds.length === 0) continue;
    literature.push({
      title: String(source.title || reference.title || 'Untitled PubMed record'),
      pmid: reference.pmid ? String(reference.pmid) : source.provenance?.recordId,
      doi: reference.doi ? String(reference.doi) : undefined,
      year: Number.isFinite(Number(reference.year)) && Number(reference.year) > 0
        ? Number(reference.year)
        : undefined,
      url: String(source.url),
      relevance: relevance.score >= 11 ? 'high' : 'medium',
      relevanceReason: String(relevance.reason || 'matched the exact target and requested organism'),
      evidenceIds,
    });
  }

  const product = facts.find(fact => fact.field === 'product')?.value;
  const catalyticActivity = facts.find(fact => fact.field === 'catalytic_activity')?.value;
  const headline = truncate([
    product ? `${input.geneSymbol} encodes ${Array.isArray(product) ? product.join('; ') : product}.` : '',
    catalyticActivity ? String(Array.isArray(catalyticActivity) ? catalyticActivity.join('; ') : catalyticActivity) : '',
  ].filter(Boolean).join(' ') || fallbackSummary, 900);

  const limitations: string[] = [];
  if (facts.length === 0) limitations.push('No exact-target authoritative facts were available.');
  if (literature.length === 0) limitations.push('No PubMed records passed exact target-and-organism relevance filtering.');
  if (literature.length > 0 && literatureFindings.length === 0) {
    limitations.push('No direct abstract sentence met the conservative result-statement criteria for a citation-bound literature fact.');
  }
  return {
    schema: 'dgr.curation-summary.v1',
    headline,
    facts: facts.slice(0, 100),
    literature: literature.slice(0, 30),
    limitations,
  };
}

const NOTE_AUTHORITATIVE_FIELDS = new Set([
  'product',
  'molecular_function',
  'catalytic_activity',
  'enzyme_classification',
  'biological_process',
  'family_or_domains',
  'cellular_component',
  'subcellular_location',
  'structure_cross_references',
  'regulatory_mechanisms',
  'expression',
  'protein_interactions',
  'phenotypes',
  'gene_family',
  'conservation',
]);

const NOTE_MAX_LENGTH = 7600;
const NOTE_MAX_SEGMENTS = 30;
const NOTE_LITERATURE_CATEGORY_LIMITS: Partial<Record<CodeXomicsResearchFact['category'], number>> = {
  regulation: 4,
  structure: 2,
};

function noteSentence(statement: string): string {
  const compact = String(statement || '').trim().replace(/\s+/g, ' ');
  if (!compact) return '';
  const sentence = compact.charAt(0).toUpperCase() + compact.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function buildCurationNote(
  summary: CodeXomicsAnnotationProposal['researchSummary'],
): CodeXomicsCurationNote | undefined {
  // A mutation-ready note must contain at least one exact, citation-bound
  // literature result. Authoritative-only records still populate the normal
  // structured qualifiers but do not create an uncited narrative annotation.
  const literatureFacts = summary.facts.filter(fact =>
    fact.evidenceLevel === 'target_literature' && fact.citation?.type === 'pmid'
  );
  if (literatureFacts.length === 0) return undefined;

  const authoritativeFieldSeen = new Set<string>();
  const authoritativeFacts = summary.facts.filter(fact => {
    if (fact.evidenceLevel === 'target_literature' || !NOTE_AUTHORITATIVE_FIELDS.has(fact.field)) return false;
    if (authoritativeFieldSeen.has(fact.field)) return false;
    authoritativeFieldSeen.add(fact.field);
    return true;
  });
  const literatureCategoryCounts = new Map<CodeXomicsResearchFact['category'], number>();
  const selectedLiteratureFacts = literatureFacts.filter(fact => {
    // Method-only sentences remain available in the full report and structured
    // summary but do not improve the compact functional annotation note.
    if (/\b(?:was constructed|has been cloned by phenotypic complementation)\b/i.test(fact.statement)) return false;
    const count = literatureCategoryCounts.get(fact.category) || 0;
    const limit = NOTE_LITERATURE_CATEGORY_LIMITS[fact.category] || 1;
    if (count >= limit) return false;
    literatureCategoryCounts.set(fact.category, count + 1);
    return true;
  });
  const availableFacts = [...authoritativeFacts, ...literatureFacts];
  const candidates = [...authoritativeFacts, ...selectedLiteratureFacts];
  const segments: CodeXomicsCurationNoteSegment[] = [];
  const seenText = new Set<string>();
  let textLength = 0;

  for (const fact of candidates) {
    if (segments.length >= NOTE_MAX_SEGMENTS) break;
    const citation = fact.evidenceLevel === 'target_literature' ? fact.citation : undefined;
    const baseText = noteSentence(fact.statement);
    if (!baseText) continue;
    const text = citation ? `${baseText} (PMID:${citation.id}).` : baseText;
    const key = text.toLowerCase();
    if (seenText.has(key)) continue;
    const separatorLength = segments.length > 0 ? 1 : 0;
    if (textLength + separatorLength + text.length > NOTE_MAX_LENGTH) continue;
    seenText.add(key);
    textLength += separatorLength + text.length;
    segments.push({
      category: fact.category,
      text,
      factIds: [fact.id],
      evidenceIds: [...fact.evidenceIds],
      citations: citation ? [{
        type: 'pmid',
        id: citation.id,
        label: citation.label,
        url: citation.url,
      }] : [],
    });
  }

  // Fail closed if the length bound prevented every literature citation from
  // being represented. An authoritative prose-only note would not satisfy the
  // curation contract promised by this field.
  if (!segments.some(segment => segment.citations.length > 0)) return undefined;
  const text = segments.map(segment => segment.text).join(' ');
  const factIds = dedupe(segments.flatMap(segment => segment.factIds));
  const included = new Set(factIds);
  return {
    schema: 'dgr.curation-note.v1',
    text,
    textSha256: createHash('sha256').update(text).digest('hex'),
    segments,
    factIds,
    evidenceIds: dedupe(segments.flatMap(segment => segment.evidenceIds)),
    coverage: {
      availableFactCount: availableFacts.length,
      includedFactCount: factIds.length,
      includedCategories: dedupe(segments.map(segment => segment.category)) as CodeXomicsResearchFact['category'][],
      omittedFactIds: availableFacts.filter(fact => !included.has(fact.id)).map(fact => fact.id),
    },
  };
}

function assertCurationNoteIntegrity(
  note: CodeXomicsCurationNote | undefined,
  researchSummary: CodeXomicsAnnotationProposal['researchSummary'],
): void {
  if (!note) return;
  const facts = new Map(researchSummary.facts.map(fact => [fact.id, fact]));
  const joined = note.segments.map(segment => segment.text).join(' ');
  if (
    note.schema !== 'dgr.curation-note.v1'
    || note.text !== joined
    || note.text.length > NOTE_MAX_LENGTH
    || note.textSha256 !== createHash('sha256').update(note.text).digest('hex')
  ) {
    throw new Error('Curation note text is not bound to its structured segments');
  }
  for (const segment of note.segments) {
    if (segment.factIds.length !== 1) throw new Error('Every curation note segment must bind exactly one fact');
    const fact = facts.get(segment.factIds[0]);
    if (!fact || JSON.stringify(segment.evidenceIds) !== JSON.stringify(fact.evidenceIds)) {
      throw new Error('Curation note segment is not bound to its research fact evidence');
    }
    if (fact.evidenceLevel === 'target_literature') {
      const citation = fact.citation;
      if (
        !citation
        || segment.citations.length !== 1
        || segment.citations[0].id !== citation.id
        || segment.text !== `${noteSentence(fact.statement)} (PMID:${citation.id}).`
      ) {
        throw new Error('Curation note literature segment is not bound to its exact PubMed fact');
      }
    } else if (segment.citations.length !== 0 || segment.text !== noteSentence(fact.statement)) {
      throw new Error('Curation note authoritative segment is not bound to its exact database fact');
    }
  }
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

function pubMedIdentifierFromDetail(detail: CodeXomicsEvidenceDetail): string | undefined {
  const structuredPmid = detail.identifiers?.find(identifier =>
    identifier.scheme.toLowerCase() === 'pmid'
  )?.value;
  const candidate = String(structuredPmid || (detail.type === 'pmid' ? detail.id : '') || '').trim();
  return /^\d{5,10}$/.test(candidate) ? candidate : undefined;
}

function pubMedIdentifierFromSource(source: Record<string, any>): string | undefined {
  const reference = source.structuredData?.literatureReferences?.[0];
  const candidate = String(
    source.pmid
    || reference?.pmid
    || (String(source.provenance?.provider || '').toLowerCase() === 'pubmed'
      ? source.provenance?.recordId
      : '')
    || ''
  ).trim();
  return /^\d{5,10}$/.test(candidate) ? candidate : undefined;
}

function buildPubMedSourceBinding(
  detail: CodeXomicsEvidenceDetail,
  sources: SourceLike[],
): NonNullable<EvidenceRecord['sourceBinding']> | undefined {
  const pmid = pubMedIdentifierFromDetail(detail);
  if (!pmid) return undefined;

  const matches = sources
    .filter((source): source is Record<string, any> => Boolean(
      source
      && typeof source === 'object'
      && String(source.database || '').toLowerCase() === 'pubmed'
      && pubMedIdentifierFromSource(source) === pmid
    ))
    .map(source => canonicalizePubMedAbstract(
      source.structuredData?.literatureReferences?.[0]?.abstract
    ))
    .filter(Boolean);
  if (matches.length === 0) return undefined;

  // A PMID must resolve to one immutable abstract in this task. If duplicated
  // sources disagree, omit the binding so no citation-bound fact is emitted.
  const abstractHashes = new Set(matches.map(abstract =>
    createHash('sha256').update(abstract).digest('hex')
  ));
  if (abstractHashes.size !== 1) return undefined;
  const abstract = matches[0];

  return {
    schema: 'dgr.evidence-source-binding.v1',
    sourceCollection: 'sources',
    selector: {
      database: 'pubmed',
      identifier: { scheme: 'pmid', value: pmid },
    },
    content: {
      relativeJsonPointer: '/structuredData/literatureReferences/0/abstract',
      canonicalization: PUBMED_ABSTRACT_CANONICALIZATION,
      sha256: createHash('sha256').update(abstract).digest('hex'),
      hashEncoding: 'utf8',
      length: abstract.length,
      lengthEncoding: PUBMED_ABSTRACT_OFFSET_ENCODING,
    },
  };
}

function buildFullTextSourceBinding(
  source: Record<string, any>,
): NonNullable<EvidenceRecord['sourceBinding']> | undefined {
  const fullText = source?.fullText;
  if (
    fullText?.schema !== 'dgr.full-text-document.v1'
    || fullText.canonicalization !== FULL_TEXT_CANONICALIZATION
    || typeof fullText.text !== 'string'
    || fullText.text.length < 200
    || !/^[a-f0-9]{64}$/i.test(String(fullText.documentSha256 || ''))
    || createHash('sha256').update(fullText.text).digest('hex') !== fullText.textSha256
  ) {
    return undefined;
  }
  const pmid = pubMedIdentifierFromSource(source) || String(fullText.identifiers?.pmid || '').trim();
  const selector = /^\d{5,10}$/.test(pmid)
    ? { scheme: 'pmid' as const, value: pmid }
    : { scheme: 'sha256' as const, value: String(fullText.documentSha256).toLowerCase() };
  return {
    schema: 'dgr.evidence-source-binding.v1',
    sourceCollection: 'sources',
    selector: {
      database: String(source.database || 'user_document'),
      identifier: selector,
    },
    content: {
      relativeJsonPointer: '/fullText/text',
      canonicalization: FULL_TEXT_CANONICALIZATION,
      sha256: fullText.textSha256,
      hashEncoding: 'utf8',
      length: fullText.text.length,
      lengthEncoding: FULL_TEXT_OFFSET_ENCODING,
    },
  };
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
  if (!existingProduct || !isMoreSpecificProduct(value, existingProduct)) return false;

  return normalizeComparable(provenance.currentValue) === normalizeComparable(existingProduct)
    && String(provenance.justification || '').trim().length >= 10;
}

function collectQualifiedMutationCandidates(
  sources: SourceLike[],
  target: GenomeTargetRef | undefined,
  currentAnnotation?: CurrentAnnotationSnapshot
): QualifiedMutationCandidate[] {
  if (!target) return [];
  const candidates = new Map<string, QualifiedMutationCandidate>();
  const featureType = String(target.featureType || '').trim().toUpperCase();
  const allowedFields = featureType === 'CDS'
    ? new Set<MutationField>(['product', 'EC_number', 'go_terms', 'ko', 'pathway', 'db_xref'])
    : featureType === 'GENE' || featureType === 'PSEUDOGENE'
      ? new Set<MutationField>(['db_xref'])
      : new Set<MutationField>(['product', 'go_terms', 'pathway', 'db_xref']);

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
      if (!allowedFields.has(definition.field)) continue;
      const values = asValues(source.annotation[definition.annotationKey]);
      const provenanceEntries = getFieldProvenance(source.annotation, definition.provenanceKey);
      for (const value of values) {
        if (currentAnnotationHasValue(currentAnnotation, definition.field, value)) continue;
        const qualifiedEvidence = provenanceEntries
          .filter(provenance => isQualifiedFieldProvenance({
            field: definition.field,
            value,
            source,
            provenance,
            currentProduct: currentAnnotation?.product,
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
  const narrativeSummary = extractSummary(finalReport);
  // Prioritize authoritative structured records so a long literature list
  // cannot crowd the exact UniProt/KEGG identity record out of the bounded
  // annotation manifest.
  const orderedSources = [...sources].sort((left, right) => {
    const rank = (source: SourceLike) => {
      if (!source || typeof source === 'string') return 0;
      if (source.annotation?.reviewed) return 5;
      if (source.annotation) return 4;
      if (source.database === 'pubmed' && source.structuredData?.targetRelevance?.directness === 'direct') return 3;
      if (source.database === 'pubmed') return 2;
      return 1;
    };
    return rank(right) - rank(left);
  });
  const evidenceDetails = extractEvidenceFromSources(orderedSources);
  for (const detail of extractEvidenceFromText(finalReport)) {
    addEvidenceDetail(evidenceDetails, detail);
  }
  evidenceDetails.splice(100);

  const generatedAt = new Date().toISOString();
  const confidence = normalizeConfidence(input.confidence);
  const evidenceSourcePayloads = evidenceDetails.map(detail => findEvidenceSourcePayload(detail, sources));
  const evidenceSourceBindings = evidenceDetails.map(detail => buildPubMedSourceBinding(detail, sources));
  const sourceRecords: EvidenceRecord[] = evidenceDetails.map((detail, index) => {
    const type = detail.type === 'source' ? 'citation' : detail.type;
    const sourceId = detail.id || detail.url || detail.label;
    const sourceBinding = evidenceSourceBindings[index];
    return {
      id: `evidence_${index + 1}`,
      type,
      label: detail.label,
      sourceId,
      url: detail.url,
      database: detail.database,
      identifiers: detail.identifiers,
      retrievedAt: generatedAt,
      // Bind the manifest to the retrieved source payload when available, not
      // merely to its citation label. This lets downstream audit detect source
      // content changes while retaining citation-only evidence records.
      sourceHash: createHash('sha256')
        .update(JSON.stringify({ detail, sourcePayload: evidenceSourcePayloads[index], sourceBinding }))
        .digest('hex'),
      ...(sourceBinding ? { sourceBinding } : {}),
      // Report text, citations, and unstructured retrieval payloads are useful
      // audit context but can never authorize an annotation mutation.
      supporting: false,
    };
  });
  for (const source of orderedSources) {
    if (!source || typeof source === 'string') continue;
    const sourceBinding = buildFullTextSourceBinding(source);
    if (!sourceBinding) continue;
    const pmid = sourceBinding.selector.identifier.scheme === 'pmid'
      ? sourceBinding.selector.identifier.value
      : undefined;
    const doi = String(source.doi || source.fullText?.identifiers?.doi || '').trim() || undefined;
    const id = `evidence_${sourceRecords.length + 1}`;
    const identifiers = [
      ...(pmid ? [{ scheme: 'pmid' as const, value: pmid }] : []),
      ...(doi ? [{ scheme: 'doi' as const, value: doi }] : []),
    ];
    sourceRecords.push({
      id,
      type: pmid ? 'pmid' : 'citation',
      label: pmid ? `PMID:${pmid} full text` : `${source.title || source.fullText?.name || 'User PDF'} full text`,
      sourceId: source.sourceId || sourceBinding.selector.identifier.value,
      url: source.url,
      database: String(source.database || 'user_document'),
      ...(identifiers.length > 0 ? { identifiers } : {}),
      retrievedAt: String(source.fullText?.retrievedAt || generatedAt),
      sourceHash: createHash('sha256').update(JSON.stringify({ sourceBinding })).digest('hex'),
      sourceBinding,
      supporting: false,
    });
  }
  const researchSummary = buildResearchSummary(input, orderedSources, sourceRecords, confidence, narrativeSummary);
  const summary = researchSummary.headline || narrativeSummary;
  const qualifiedCandidates = collectQualifiedMutationCandidates(sources, input.target, input.currentAnnotation);
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

  const proposedCurationNote = input.target ? buildCurationNote(researchSummary) : undefined;
  const curationNote = proposedCurationNote && !currentAnnotationHasValue(
    input.currentAnnotation,
    'note',
    proposedCurationNote.text,
  ) ? proposedCurationNote : undefined;
  if (curationNote) {
    const noteEvidenceIds = new Set(curationNote.evidenceIds);
    for (const record of sourceRecords) {
      if (noteEvidenceIds.has(record.id)) record.supporting = true;
    }
    const noteClaim = {
      id: `claim_${claims.length + 1}`,
      field: 'note',
      value: curationNote.text,
      evidenceIds: [...curationNote.evidenceIds],
      confidence,
    };
    claims.push(noteClaim);
    operations.push({
      op: 'addQualifier',
      field: 'note',
      value: curationNote.text,
      claimIds: [noteClaim.id],
    });
    updates.note = curationNote.text;
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
    researchSummary,
    ...(curationNote ? { curationNote } : {}),
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
  assertCurationNoteIntegrity(curationNote, researchSummary);
  assertAnnotationChangeSetProposalIntegrity(proposal);
  return proposal;
}
