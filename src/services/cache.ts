import { GeneResearchParameters } from '@/models/task';
import { Md5 } from 'ts-md5';
import packageMetadata from '../../package.json';
import { normalizeAnnotationQualifierValue } from '@/utils/gene-research/current-annotation';
import type { CurrentAnnotationSnapshot } from '@/contracts/annotation-change-set';

const CACHE_SCHEMA_VERSION = 'dgr-research-cache-v5';
const NON_SEMANTIC_PARAMETER_KEYS = new Set([
  'idempotencyKey',
  'correlationId',
  'forceRefresh',
  'returnReportAsUrl',
  'returnDetailsAsUrl',
]);
const EXACT_TARGET_DATABASES = new Set([
  'biocyc',
  'ecocyc',
  'ensembl',
  'genbank',
  'kegg',
  'ncbi',
  'ncbi_gene',
  'refseq',
  'uniprot',
]);
const PLACEHOLDER_PATTERN = /\[(?:brief description|specific function|key structural|ncbi gene id|enzyme commission number|chemical equation|main substrates|required cofactors|list of aliases|chromosome and coordinates|number of (?:exons|introns)|[^\]]*unknown[^\]]*)[^\]]*\]/i;
const EXACT_TARGET_FIELDS = [
  'workspaceId',
  'genomeId',
  'featureId',
  'featureHash',
  'chromosome',
] as const;

interface CacheItem {
  key: string;
  result: any;
  createdAt: Date;
  expiresAt: Date;
}

export interface ResearchCacheContext {
  cacheSchemaVersion: string;
  pipelineVersion: string;
  aiProvider: string;
  thinkingModel: string;
  taskModel: string;
  searchProvider: string;
  searchBaseURL: string;
  searchScope: string;
}

const cacheStorage: Map<string, CacheItem> = new Map();

function normalizeEndpoint(value: string | undefined): string {
  const endpoint = String(value || '').trim().replace(/\/+$/, '');
  if (!endpoint) return '';
  try {
    const url = new URL(endpoint);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return endpoint;
  }
}

function configuredSearchBaseURL(provider: string): string {
  const environmentKey: Record<string, string> = {
    tavily: 'TAVILY_API_BASE_URL',
    firecrawl: 'FIRECRAWL_API_BASE_URL',
    exa: 'EXA_API_BASE_URL',
    bocha: 'BOCHA_API_BASE_URL',
    searxng: 'SEARXNG_API_BASE_URL',
  };
  const key = environmentKey[provider];
  if (!key) return '';
  return normalizeEndpoint(process.env[key]);
}

export function getResearchCacheContext(
  overrides: Partial<ResearchCacheContext> = {}
): ResearchCacheContext {
  const searchProvider = overrides.searchProvider ?? process.env.MCP_SEARCH_PROVIDER ?? 'model';
  return {
    cacheSchemaVersion: overrides.cacheSchemaVersion ?? CACHE_SCHEMA_VERSION,
    pipelineVersion: overrides.pipelineVersion ?? packageMetadata.version,
    aiProvider: overrides.aiProvider ?? process.env.MCP_AI_PROVIDER ?? '',
    thinkingModel: overrides.thinkingModel ?? process.env.MCP_THINKING_MODEL ?? '',
    taskModel: overrides.taskModel ?? process.env.MCP_TASK_MODEL ?? '',
    searchProvider,
    searchBaseURL: normalizeEndpoint(
      overrides.searchBaseURL ?? configuredSearchBaseURL(searchProvider)
    ),
    searchScope: overrides.searchScope ?? process.env.MCP_SEARXNG_SCOPE ?? '',
  };
}

/** Deterministic serialization for nested objects; undefined object fields are omitted. */
export function stableSerialize(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;

  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
    .join(',')}}`;
}

function canonicalizeParameters(parameters: GeneResearchParameters): Record<string, unknown> {
  const entries = Object.entries(parameters)
    .filter(([key, value]) => !NON_SEMANTIC_PARAMETER_KEYS.has(key) && value !== undefined)
    .map(([key, value]) => {
      if ((key === 'researchFocus' || key === 'specificAspects') && Array.isArray(value)) {
        return [key, Array.from(new Set(value.map(item => String(item).trim()))).sort()] as const;
      }
      if (key === 'currentAnnotation' && value && typeof value === 'object') {
        const snapshot = value as CurrentAnnotationSnapshot;
        const canonicalSnapshot: Record<string, string | string[]> = {};
        for (const field of ['product', 'note', 'EC_number', 'go_terms', 'ko', 'pathway', 'db_xref'] as const) {
          const rawValues = field === 'product'
            ? [snapshot.product]
            : Array.isArray(snapshot[field])
              ? snapshot[field] as string[]
              : [];
          const normalized = Array.from(new Set(rawValues
            .map(item => normalizeAnnotationQualifierValue(field, item))
            .filter(Boolean)))
            .sort();
          if (field === 'product') {
            if (normalized[0]) canonicalSnapshot.product = normalized[0];
          } else if (normalized.length > 0) {
            canonicalSnapshot[field] = normalized;
          }
        }
        return [key, canonicalSnapshot] as const;
      }
      return [key, value] as const;
    });
  return Object.fromEntries(entries);
}

export function buildCacheKeyPayload(
  parameters: GeneResearchParameters,
  contextOverrides: Partial<ResearchCacheContext> = {}
): Record<string, unknown> {
  return {
    context: getResearchCacheContext(contextOverrides),
    parameters: canonicalizeParameters(parameters),
  };
}

export function generateCacheKey(
  parameters: GeneResearchParameters,
  contextOverrides: Partial<ResearchCacheContext> = {}
): string {
  return Md5.hashStr(stableSerialize(buildCacheKeyPayload(parameters, contextOverrides))) as string;
}

function targetMatches(parameters: GeneResearchParameters, result: any): boolean {
  const requestedTarget = parameters.target;
  const resultTarget = result?.annotationProposal?.target;
  if (!requestedTarget || !resultTarget) return false;

  const exactIdentityMatches = EXACT_TARGET_FIELDS.every(field =>
    String(resultTarget[field] ?? '') === String(requestedTarget[field] ?? '')
  );
  const resultRevision = result?.annotationProposal?.baseRevision ?? resultTarget.annotationRevision;
  return exactIdentityMatches && Number(resultRevision) === Number(requestedTarget.annotationRevision);
}

function sourceIdentity(source: any): string {
  const pmid = String(source?.pmid || '').trim();
  if (pmid) return `pmid:${pmid}`;
  const doi = String(source?.doi || '').trim().toLowerCase();
  if (doi) return `doi:${doi}`;
  const rawURL = String(source?.url || '').trim();
  if (rawURL) {
    try {
      const url = new URL(rawURL);
      url.hash = '';
      return url.toString().replace(/\/+$/, '').toLowerCase();
    } catch {
      return rawURL.toLowerCase();
    }
  }
  return '';
}

function sourcePayload(source: any): string {
  const structuredData = source?.structuredData
    ? stableSerialize(source.structuredData)
    : '';
  return [source?.content, source?.abstract, source?.summary, source?.rawContent, structuredData]
    .filter(Boolean)
    .join('\n')
    .trim();
}

function isExactTargetAuthoritativeSource(source: any): boolean {
  const database = String(source?.database || '').trim().toLowerCase();
  return EXACT_TARGET_DATABASES.has(database)
    && source?.authoritative === true
    && source?.targetMatch === true;
}

function isTargetRelevantLiterature(source: any): boolean {
  const database = String(source?.database || '').trim().toLowerCase();
  return database === 'pubmed'
    && source?.structuredData?.targetRelevance?.accepted === true
    && source?.structuredData?.targetRelevance?.directness !== 'gene_linked_context'
    && Boolean(source?.provenance?.recordId || source?.pmid || source?.url);
}

/**
 * Cache reuse is intentionally stricter than result delivery. A fresh run may
 * honestly return limited evidence, but only exact-target, multi-record results
 * with at least one authoritative record may be reused later.
 */
export function isReusableResearchResult(
  parameters: GeneResearchParameters,
  result: any
): boolean {
  if (!targetMatches(parameters, result)) return false;

  const report = String(result?.finalReport || '').trim();
  if (!report || PLACEHOLDER_PATTERN.test(report)) return false;

  const diagnostics = result?.metadata?.searchDiagnostics;
  if (diagnostics && Number(diagnostics.successfulSearches || 0) < 1) return false;

  const uniqueSources = new Map<string, any>();
  for (const source of Array.isArray(result?.sources) ? result.sources : []) {
    const identity = sourceIdentity(source);
    if (!identity || sourcePayload(source).length < 80) continue;
    const existing = uniqueSources.get(identity);
    if (!existing || sourcePayload(source).length > sourcePayload(existing).length) {
      uniqueSources.set(identity, source);
    }
  }

  const substantiveSources = Array.from(uniqueSources.values());
  const exactTargetSources = substantiveSources.filter(isExactTargetAuthoritativeSource);
  const targetRelevantSources = substantiveSources.filter(source =>
    isExactTargetAuthoritativeSource(source) || isTargetRelevantLiterature(source)
  );
  return exactTargetSources.length >= 1 && targetRelevantSources.length >= 2;
}

class CacheService {
  private defaultExpiration = 7 * 24 * 60 * 60 * 1000;

  async getCachedResult(parameters: GeneResearchParameters): Promise<any | null> {
    try {
      const key = generateCacheKey(parameters);
      const cacheItem = cacheStorage.get(key);
      if (!cacheItem) return null;

      if (new Date() > cacheItem.expiresAt || !isReusableResearchResult(parameters, cacheItem.result)) {
        cacheStorage.delete(key);
        return null;
      }

      return structuredClone(cacheItem.result);
    } catch (error) {
      console.error('Error getting cached result:', error);
      return null;
    }
  }

  async setCachedResult(parameters: GeneResearchParameters, result: any): Promise<void> {
    try {
      if (!isReusableResearchResult(parameters, result)) return;
      const key = generateCacheKey(parameters);
      const now = new Date();
      cacheStorage.set(key, {
        key,
        result: structuredClone(result),
        createdAt: now,
        expiresAt: new Date(now.getTime() + this.defaultExpiration),
      });
    } catch (error) {
      console.error('Error setting cached result:', error);
    }
  }

  async deleteCachedResult(parameters: GeneResearchParameters): Promise<boolean> {
    try {
      return cacheStorage.delete(generateCacheKey(parameters));
    } catch (error) {
      console.error('Error deleting cached result:', error);
      return false;
    }
  }

  async clearAllCache(): Promise<boolean> {
    try {
      cacheStorage.clear();
      return true;
    } catch (error) {
      console.error('Error clearing cache:', error);
      return false;
    }
  }

  async getCacheStats(): Promise<{
    totalItems: number;
    expiredItems: number;
    size: number;
  }> {
    try {
      let expiredItems = 0;
      const now = new Date();
      cacheStorage.forEach(cacheItem => {
        if (now > cacheItem.expiresAt) expiredItems++;
      });
      return {
        totalItems: cacheStorage.size,
        expiredItems,
        size: cacheStorage.size,
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return { totalItems: 0, expiredItems: 0, size: 0 };
    }
  }
}

export const cacheService = new CacheService();
