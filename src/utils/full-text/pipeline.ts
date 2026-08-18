import { fetchPublicBytes } from '@/utils/safe-public-fetch';
import type { FullTextDocument } from '@/utils/gene-research/full-text';
import { segmentPdfDocument } from './segment/pdf';
import {
  acquireEuropePmcJats,
  europePmcSupplementaryFilesUrl,
  fetchEuropePmcAnnotations,
  resolveEuropePmcWork,
} from './providers/europe-pmc';
import { acquirePubtatorBioc } from './providers/pubtator';
import { fetchCrossrefWorkMetadata } from './providers/crossref';
import { locateUnpaywallOaCopy } from './providers/unpaywall';
import { acquireBioRxivPreprintPdf } from './providers/biorxiv';
import { acquireOpenAlexTei } from './providers/openalex';
import { discoverCoreFullText } from './providers/core';
import { acquireBiocPmcFullText } from './providers/bioc-pmc';
import { convertPublicationIds } from './providers/ncbi-idconv';
import { locatePmcOaPackage } from './providers/pmc-oa';
import { fetchSemanticScholarEnrichment } from './providers/semanticscholar';
import type {
  AcquiredContent,
  CandidateWork,
  FullTextAcquisition,
  FullTextPipelineEnv,
  FullTextPipelineOptions,
  FullTextProviderAttempt,
  FullTextProviderId,
  ProviderAnnotation,
  WorkMetadata,
} from './types';

const TIER1_PROVIDERS: FullTextProviderId[] = [
  'europe_pmc',
  'europe_pmc_annotations',
  'pubtator',
  'crossref',
  'unpaywall',
];

const ALL_PROVIDERS: FullTextProviderId[] = [
  ...TIER1_PROVIDERS,
  'asta',
  'openalex',
  'core',
  'biorxiv',
  'bioc_pmc',
  'ncbi_idconv',
  'pmc_oa',
  'semantic_scholar',
  'arxiv',
];

/** Read provider credentials/config from the process environment. */
export function readFullTextEnv(env: NodeJS.ProcessEnv = process.env): FullTextPipelineEnv {
  return {
    ncbiApiKey: env.NCBI_API_KEY || env.NCBI_EUTILS_API_KEY || undefined,
    crossrefMailto: env.CROSSREF_MAILTO || undefined,
    unpaywallEmail: env.UNPAYWALL_EMAIL || undefined,
    astaApiKey: env.ASTA_API_KEY || undefined,
    openAlexApiKey: env.OPENALEX_API_KEY || undefined,
    coreApiKey: env.CORE_API_KEY || undefined,
  };
}

/**
 * Default enablement: all Tier 1 providers plus Tier 2 providers whose
 * credentials are configured. `FULL_TEXT_PROVIDERS` (comma-separated) is an
 * explicit whitelist override.
 */
export function resolveEnabledProviders(
  env: FullTextPipelineEnv,
  override?: FullTextProviderId[],
  rawWhitelist: string | undefined = process.env.FULL_TEXT_PROVIDERS,
): FullTextProviderId[] {
  if (override) return override;
  if (rawWhitelist?.trim()) {
    const requested = new Set(rawWhitelist.split(',').map(value => value.trim()).filter(Boolean));
    return ALL_PROVIDERS.filter(provider => requested.has(provider));
  }
  const enabled = new Set<FullTextProviderId>(TIER1_PROVIDERS);
  if (env.unpaywallEmail) enabled.add('unpaywall'); else enabled.delete('unpaywall');
  // bioRxiv/medRxiv needs no credentials; it only fires for preprint DOIs.
  enabled.add('biorxiv');
  if (env.astaApiKey) enabled.add('asta');
  if (env.openAlexApiKey) enabled.add('openalex');
  if (env.coreApiKey) enabled.add('core');
  return ALL_PROVIDERS.filter(provider => enabled.has(provider));
}

const MAX_PDF_BYTES = 30 * 1024 * 1024;

/**
 * Download an OA PDF copy and segment it into the shared document model.
 * Publisher/repository URLs are user-influenced, so this goes through the
 * SSRF-hardened binary fetcher and validates the PDF magic bytes.
 */
export async function acquirePdfFromUrl(
  url: string,
  work: CandidateWork,
): Promise<FullTextDocument | null> {
  const response = await fetchPublicBytes(url, { maxBytes: MAX_PDF_BYTES, timeoutMs: 45_000 });
  if (response.body.length < 5 || response.body.toString('latin1', 0, 5) !== '%PDF-') return null;
  return segmentPdfDocument({
    bytes: new Uint8Array(response.body),
    name: `${work.doi || work.pmid || 'full-text'}.pdf`,
    mediaType: 'application/pdf',
    documentSha256: undefined,
    sourceUrl: response.url.toString(),
    origin: 'pdf',
    identifiers: { pmid: work.pmid, doi: work.doi, pmcid: work.pmcid },
  });
}

interface AcquisitionStep {
  provider: FullTextProviderId;
  run: (work: CandidateWork, metadata: WorkMetadata) => Promise<AcquiredContent | null>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * resolve -> acquire waterfall for one candidate work. The cheapest
 * structured formats win: Europe PMC JATS, then PubTator BioC (pre-sectioned
 * with entity annotations), then an OA PDF copy as the last resort. Crossref
 * and Unpaywall run as metadata enrichment regardless of the content path.
 */
export async function acquireFullTextEvidence(
  anchor: CandidateWork,
  options: FullTextPipelineOptions = {},
  env: FullTextPipelineEnv = readFullTextEnv(),
): Promise<FullTextAcquisition> {
  const enabled = new Set(resolveEnabledProviders(env, options.enabledProviders));
  const attempts: FullTextProviderAttempt[] = [];
  const metadata: WorkMetadata = {};

  const work: CandidateWork = { ...anchor };

  // resolve: fill in PMCID / DOI / title / preprint flag from Europe PMC.
  if (enabled.has('europe_pmc') && (work.pmid || work.doi) && (!work.pmcid || !work.doi || !work.title)) {
    const startedAt = Date.now();
    try {
      const resolved = await resolveEuropePmcWork({ pmid: work.pmid, doi: work.doi });
      if (resolved) {
        work.pmid = work.pmid ?? resolved.pmid;
        work.pmcid = work.pmcid ?? resolved.pmcid;
        work.doi = work.doi ?? resolved.doi;
        work.title = work.title ?? resolved.title;
        work.isPreprint = work.isPreprint ?? resolved.isPreprint;
        attempts.push({ provider: 'europe_pmc', status: 'success', durationMs: Date.now() - startedAt });
      } else {
        attempts.push({ provider: 'europe_pmc', status: 'empty', durationMs: Date.now() - startedAt });
      }
    } catch (error) {
      attempts.push({ provider: 'europe_pmc', status: 'error', durationMs: Date.now() - startedAt, error: errorMessage(error) });
    }
  }

  // resolve augmentation (opt-in Tier 3): NCBI ID Converter fills any still
  // missing identifiers in a single batch call.
  if (enabled.has('ncbi_idconv') && (work.pmid || work.doi || work.pmcid) && (!work.pmcid || !work.doi || !work.pmid)) {
    const startedAt = Date.now();
    try {
      const anchorId = work.pmid ?? work.doi ?? work.pmcid!;
      const converted = (await convertPublicationIds([anchorId], { apiKey: env.ncbiApiKey }))[0];
      if (converted) {
        work.pmid = work.pmid ?? converted.pmid;
        work.pmcid = work.pmcid ?? converted.pmcid;
        work.doi = work.doi ?? converted.doi;
        attempts.push({ provider: 'ncbi_idconv', status: 'success', durationMs: Date.now() - startedAt });
      } else {
        attempts.push({ provider: 'ncbi_idconv', status: 'empty', durationMs: Date.now() - startedAt });
      }
    } catch (error) {
      attempts.push({ provider: 'ncbi_idconv', status: 'error', durationMs: Date.now() - startedAt, error: errorMessage(error) });
    }
  }

  // Metadata enrichment runs in parallel with nothing else depending on it.
  const metadataTasks: Array<Promise<void>> = [];
  if (enabled.has('crossref') && work.doi) {
    metadataTasks.push((async () => {
      const startedAt = Date.now();
      try {
        const result = await fetchCrossrefWorkMetadata(work.doi!, { mailto: env.crossrefMailto });
        if (result) Object.assign(metadata, result);
        attempts.push({
          provider: 'crossref',
          status: result ? 'success' : 'empty',
          durationMs: Date.now() - startedAt,
          ...(result?.isRetracted ? { warnings: ['Crossref reports this work as retracted'] } : {}),
        });
      } catch (error) {
        attempts.push({ provider: 'crossref', status: 'error', durationMs: Date.now() - startedAt, error: errorMessage(error) });
      }
    })());
  }
  if (enabled.has('unpaywall') && work.doi) {
    metadataTasks.push((async () => {
      const startedAt = Date.now();
      try {
        const result = await locateUnpaywallOaCopy(work.doi!, { email: env.unpaywallEmail });
        if (result) Object.assign(metadata, result);
        attempts.push({ provider: 'unpaywall', status: result ? 'success' : 'empty', durationMs: Date.now() - startedAt });
      } catch (error) {
        attempts.push({ provider: 'unpaywall', status: 'error', durationMs: Date.now() - startedAt, error: errorMessage(error) });
      }
    })());
  }
  // Opt-in Tier 3 metadata: PMC OA package location and Semantic Scholar
  // citation/TLDR enrichment.
  if (enabled.has('pmc_oa') && work.pmcid) {
    metadataTasks.push((async () => {
      const startedAt = Date.now();
      try {
        const result = await locatePmcOaPackage(work.pmcid!);
        if (result) {
          metadata.pmcOaPackageUrl = result.tgzUrl;
          if (!metadata.license && result.license) metadata.license = result.license;
        }
        attempts.push({ provider: 'pmc_oa', status: result ? 'success' : 'empty', durationMs: Date.now() - startedAt });
      } catch (error) {
        attempts.push({ provider: 'pmc_oa', status: 'error', durationMs: Date.now() - startedAt, error: errorMessage(error) });
      }
    })());
  }
  if (enabled.has('semantic_scholar') && work.doi) {
    metadataTasks.push((async () => {
      const startedAt = Date.now();
      try {
        const result = await fetchSemanticScholarEnrichment(work.doi!);
        if (result) {
          if (result.tldr) metadata.tldr = result.tldr;
          if (typeof result.citationCount === 'number') metadata.citationCount = result.citationCount;
          if (!metadata.oaPdfUrl && result.oaPdfUrl) metadata.oaPdfUrl = result.oaPdfUrl;
        }
        attempts.push({ provider: 'semantic_scholar', status: result ? 'success' : 'empty', durationMs: Date.now() - startedAt });
      } catch (error) {
        attempts.push({ provider: 'semantic_scholar', status: 'error', durationMs: Date.now() - startedAt, error: errorMessage(error) });
      }
    })());
  }

  const steps: AcquisitionStep[] = [];
  if (enabled.has('europe_pmc') && work.pmcid) {
    steps.push({
      provider: 'europe_pmc',
      run: async current => {
        const document = await acquireEuropePmcJats(current);
        if (!document) return null;
        const content: AcquiredContent = {
          provider: 'europe_pmc',
          format: 'jats',
          document,
          supplementaryFilesUrl: europePmcSupplementaryFilesUrl(current.pmcid!),
        };
        return content;
      },
    });
  }
  if (enabled.has('pubtator') && work.pmid) {
    steps.push({
      provider: 'pubtator',
      run: async current => acquirePubtatorBioc(current.pmid!, { ncbiApiKey: env.ncbiApiKey }),
    });
  }
  // Opt-in Tier 3: PMC OA full text in BioC form without PubTator annotations.
  if (enabled.has('bioc_pmc') && work.pmcid) {
    steps.push({
      provider: 'bioc_pmc',
      run: async current => acquireBiocPmcFullText(current.pmcid!),
    });
  }
  // Tier 2: preprints rarely have PMC JATS; bioRxiv/medRxiv serve the
  // versioned PDF directly.
  if (options.allowPdf !== false && enabled.has('biorxiv') && work.doi
      && (work.isPreprint || work.doi.startsWith('10.1101/'))) {
    steps.push({
      provider: 'biorxiv',
      run: async current => acquireBioRxivPreprintPdf(current.doi!),
    });
  }
  // Tier 2: OpenAlex GROBID TEI — the only cross-disciplinary structured
  // full-text fallback. Downloads are paid ($0.01), so the provider enforces
  // a daily cap (default 100, the free key tier).
  if (enabled.has('openalex') && work.doi) {
    steps.push({
      provider: 'openalex',
      run: async current => acquireOpenAlexTei(current.doi!, { apiKey: env.openAlexApiKey }),
    });
  }
  // Tier 2: CORE discovers green-OA repository copies (author self-archived
  // manuscripts) that Unpaywall's publisher focus misses.
  if (options.allowPdf !== false && enabled.has('core') && work.doi) {
    steps.push({
      provider: 'core',
      run: async current => {
        const located = await discoverCoreFullText(current.doi!, { apiKey: env.coreApiKey });
        const pdfUrl = located?.oaPdfUrl;
        if (!pdfUrl) return null;
        if (located.oaRepositoryUrl && !metadata.oaRepositoryUrl) {
          metadata.oaRepositoryUrl = located.oaRepositoryUrl;
        }
        const document = await acquirePdfFromUrl(pdfUrl, current);
        return document ? { provider: 'core', format: 'pdf', document } : null;
      },
    });
  }
  if (options.allowPdf !== false && enabled.has('unpaywall')) {
    steps.push({
      provider: 'unpaywall',
      run: async current => {
        // The Unpaywall metadata task may still be in flight; wait for it.
        await Promise.allSettled(metadataTasks);
        if (!metadata.oaPdfUrl) return null;
        const document = await acquirePdfFromUrl(metadata.oaPdfUrl, current);
        return document ? { provider: 'unpaywall', format: 'pdf', document } : null;
      },
    });
  }

  let content: AcquiredContent | null = null;
  for (const step of steps) {
    options.signal?.throwIfAborted();
    const startedAt = Date.now();
    try {
      const acquired = await step.run(work, metadata);
      if (acquired) {
        content = acquired;
        attempts.push({ provider: step.provider, status: 'success', durationMs: Date.now() - startedAt });
        break;
      }
      attempts.push({ provider: step.provider, status: 'empty', durationMs: Date.now() - startedAt });
    } catch (error) {
      attempts.push({ provider: step.provider, status: 'error', durationMs: Date.now() - startedAt, error: errorMessage(error) });
    }
  }

  // Europe PMC entity annotations enrich whichever document was acquired.
  if (content && enabled.has('europe_pmc_annotations')) {
    const articleIds = [
      work.pmcid ? `PMC:${work.pmcid.replace(/^PMC/i, '')}` : null,
      work.pmid ? `MED:${work.pmid}` : null,
    ].filter((value): value is string => Boolean(value));
    if (articleIds.length > 0) {
      const startedAt = Date.now();
      try {
        const annotations = await fetchEuropePmcAnnotations(articleIds);
        if (annotations.length > 0) {
          content.providerAnnotations = [
            ...(content.providerAnnotations || []),
            ...annotations,
          ];
        }
        attempts.push({
          provider: 'europe_pmc_annotations',
          status: annotations.length > 0 ? 'success' : 'empty',
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        attempts.push({ provider: 'europe_pmc_annotations', status: 'error', durationMs: Date.now() - startedAt, error: errorMessage(error) });
      }
    }
  }

  await Promise.allSettled(metadataTasks);
  return { content, metadata, attempts };
}

/**
 * Resolve provider-reported mentions (start/end === -1, e.g. Europe PMC
 * Annotations or BioC after canonicalization) to offsets inside the
 * normalized document text. Each mention is located at its first occurrence,
 * preferring an exact case-sensitive match. Mentions not found are dropped.
 */
export function locateProviderAnnotations(
  document: FullTextDocument,
  annotations: ProviderAnnotation[],
): ProviderAnnotation[] {
  const located: ProviderAnnotation[] = [];
  for (const annotation of annotations) {
    if (annotation.start >= 0 && annotation.end > annotation.start) {
      located.push(annotation);
      continue;
    }
    const mention = annotation.mention.trim();
    if (!mention) continue;
    let start = document.text.indexOf(mention);
    if (start < 0) start = document.text.toLowerCase().indexOf(mention.toLowerCase());
    if (start < 0) continue;
    located.push({ ...annotation, start, end: start + mention.length });
  }
  return located;
}
