import type {
  FullTextDocument,
  FullTextEvidenceSpan,
} from '@/utils/gene-research/full-text';

/**
 * Shared contracts for the DGR full-text evidence layer. The layer's
 * primitive is "citable evidence spans about the research target", not
 * "download the document". Every provider fills one or more of four stages:
 *
 *   resolve   gene anchor / partial identifiers -> CandidateWork
 *   acquire   CandidateWork -> AcquiredContent (best available format)
 *   segment   raw content -> FullTextDocument with UTF-16 offsets
 *   extract   FullTextDocument -> FullTextEvidenceSpan[]
 *
 * All documents and spans keep the `dgr.full-text.v1` canonicalization so
 * CodeXomics EvidenceRecord.sourceBinding verification stays intact.
 */

export type FullTextProviderId =
  // Tier 1
  | 'europe_pmc'
  | 'europe_pmc_annotations'
  | 'pubtator'
  | 'crossref'
  | 'unpaywall'
  // Tier 2
  | 'asta'
  | 'openalex'
  | 'core'
  | 'biorxiv'
  // Tier 3
  | 'bioc_pmc'
  | 'ncbi_idconv'
  | 'pmc_oa'
  | 'semantic_scholar'
  | 'arxiv';

export type AcquisitionFormat = 'jats' | 'bioc' | 'tei' | 'pdf' | 'snippet';

/** resolve stage output: one candidate publication with what we know so far. */
export interface CandidateWork {
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  /** True when the work is a bioRxiv/medRxiv-style preprint. */
  isPreprint?: boolean;
}

/** Metadata enrichment (Crossref / OpenAlex) attached during acquisition. */
export interface WorkMetadata {
  /** Best license URL/label, preferring the version-of-record entry. */
  license?: string;
  /** Publisher text-mining link advertised via Crossref message.link. */
  textMiningUrl?: string;
  /** Crossref update-to/update-of retraction signal. */
  isRetracted?: boolean;
  /** Open access location for a downloadable copy (Unpaywall/OpenAlex/CORE). */
  oaPdfUrl?: string;
  oaRepositoryUrl?: string;
  /** Whole-package archive (figures + supplementary) from the PMC OA service. */
  pmcOaPackageUrl?: string;
  /** Semantic Scholar enrichment (transient use only; see provider JSDoc). */
  tldr?: string;
  citationCount?: number;
}

/** acquire stage output: content normalized into the shared document model. */
export interface AcquiredContent {
  provider: FullTextProviderId;
  format: AcquisitionFormat;
  document: FullTextDocument;
  /**
   * Entity/relationship annotations supplied by the provider itself
   * (PubTator BioC annotations, Europe PMC Annotations API). These carry
   * provider-computed offsets into document.text and bypass the regex
   * extractor.
   */
  providerAnnotations?: ProviderAnnotation[];
  metadata?: WorkMetadata;
  /** Supplementary-material archive location (Europe PMC). Recorded, not unpacked. */
  supplementaryFilesUrl?: string;
}

/** An entity annotation with offsets into the normalized document text. */
export interface ProviderAnnotation {
  /** Entity type, e.g. Gene/Species/Chemical/Disease/Mutation (PubTator). */
  type: string;
  /** Normalized identifier, e.g. NCBI Gene ID, when the provider supplies one. */
  identifier?: string;
  mention: string;
  start: number;
  end: number;
}

export interface FullTextAcquisition {
  content: AcquiredContent | null;
  metadata: WorkMetadata;
  /** Ordered provider attempts for searchAttempts-style logging. */
  attempts: FullTextProviderAttempt[];
}

export interface FullTextProviderAttempt {
  provider: FullTextProviderId;
  status: 'success' | 'empty' | 'error' | 'skipped';
  durationMs: number;
  error?: string;
  warnings?: string[];
}

export interface FullTextPipelineOptions {
  signal?: AbortSignal;
  /** Providers allowed to run, defaults to all configured Tier 1/2 providers. */
  enabledProviders?: FullTextProviderId[];
  /** Skip downloading PDF copies (keeps the layer XML/BioC/snippet only). */
  allowPdf?: boolean;
}

export interface FullTextPipelineEnv {
  ncbiApiKey?: string;
  crossrefMailto?: string;
  unpaywallEmail?: string;
  astaApiKey?: string;
  openAlexApiKey?: string;
  coreApiKey?: string;
}

/** Result of the extract stage for one acquired document. */
export interface ExtractedEvidence {
  content: AcquiredContent;
  spans: FullTextEvidenceSpan[];
}
