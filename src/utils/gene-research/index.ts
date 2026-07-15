// Main gene research integration system
// Comprehensive gene research workflow orchestration

import { GeneQueryGenerator, createGeneQueryGenerator } from './query-generator';
import { createGeneSearchProvider } from './search-providers';
import { GeneDataExtractor } from './data-extractor';
import { GeneVisualizationGenerator, createGeneVisualizationGenerator } from './visualization-generators';
import { GeneResearchQualityControl, createGeneQualityControl } from './quality-control';
import { GeneAPIIntegrations, createGeneAPIIntegrations } from './api-integrations';
import { createSearchProvider } from '@/utils/deep-research/search';
import { fetchPublicText } from '@/utils/safe-public-fetch';
import type { GenomeTargetRef } from '@/contracts/annotation-change-set';
import { 
  GeneResearchWorkflow, 
  GeneSearchTask, 
  GeneDataExtractionResult,
  GeneResearchQualityMetrics 
} from '@/types/gene-research';

export interface GeneResearchConfig {
  geneSymbol: string;
  organism: string;
  target?: Partial<GenomeTargetRef>;
  researchFocus?: string[];
  specificAspects?: string[];
  diseaseContext?: string;
  experimentalApproach?: string;
  userPrompt?: string;
  targetAudience?: 'researchers' | 'clinicians' | 'students' | 'general';
  reportType?: 'comprehensive' | 'focused' | 'comparative';
  enableAPIIntegration?: boolean;
  enableQualityControl?: boolean;
  enableVisualization?: boolean;
  maxSearchResults?: number;
  searchProviders?: string[];
  fallbackSearchProvider?: {
    provider: string;
    baseURL?: string;
    apiKey?: string;
    maxResult?: number;
    scope?: string;
  };
  language?: string;
  signal?: AbortSignal;
  onProgress?: (data: Record<string, any>) => void;
}

export interface GeneResearchResult {
  workflow: GeneResearchWorkflow;
  qualityMetrics: GeneResearchQualityMetrics;
  visualizations: any[];
  report: any;
  sources: any[];
  metadata: {
    researchTime: number;
    dataSources: string[];
    confidence: number;
    completeness: number;
    searchDiagnostics: {
      queryCount: number;
      followUpQueryCount: number;
      attemptedSearches: number;
      successfulSearches: number;
      sourceCount: number;
      uniqueSourceCount: number;
      attempts: Array<{
        query: string;
        provider: string;
        phase?: 'identity' | 'research' | 'follow_up' | 'retrieval';
        category?: string;
        sourceCount: number;
        durationMs: number;
        status: 'success' | 'empty' | 'error';
        error?: string;
      }>;
      identityResolved?: boolean;
      authoritativeSourceCount?: number;
      literatureSourceCount?: number;
      discoverySourceCount?: number;
      retrievedContentCount?: number;
      degradedProviders?: string[];
      coverageByCategory?: Record<string, {
        queries: number;
        sources: number;
        literatureSources: number;
        fullContentSources: number;
      }>;
      evidenceGaps?: string[];
    };
  };
}

interface ResearchCoverage {
  identityResolved: boolean;
  authoritativeSourceCount: number;
  literatureSourceCount: number;
  discoverySourceCount: number;
  retrievedContentCount: number;
  degradedProviders: string[];
  coverageByCategory: Record<string, {
    queries: number;
    sources: number;
    literatureSources: number;
    fullContentSources: number;
  }>;
  evidenceGaps: string[];
}

export class GeneResearchEngine {
  private config: GeneResearchConfig;
  private queryGenerator: GeneQueryGenerator;
  private dataExtractor: GeneDataExtractor;
  private visualizationGenerator: GeneVisualizationGenerator;
  private qualityControl: GeneResearchQualityControl;
  private apiIntegrations: GeneAPIIntegrations;
  private searchAttempts: GeneResearchResult['metadata']['searchDiagnostics']['attempts'] = [];
  private identityTerms = new Set<string>();

  constructor(config: GeneResearchConfig) {
    this.config = config;
    this.queryGenerator = createGeneQueryGenerator({
      geneSymbol: config.geneSymbol,
      organism: config.organism,
      researchFocus: config.researchFocus,
      specificAspects: config.specificAspects,
      diseaseContext: config.diseaseContext,
      experimentalApproach: config.experimentalApproach
    });
    this.dataExtractor = new GeneDataExtractor(config.geneSymbol, config.organism, config.signal);
    this.visualizationGenerator = createGeneVisualizationGenerator(config.geneSymbol, config.organism);
    this.qualityControl = createGeneQualityControl(config.geneSymbol, config.organism);
    this.apiIntegrations = createGeneAPIIntegrations(config.geneSymbol, config.organism, undefined, config.signal);
  }

  private assertNotCancelled(): void {
    this.config.signal?.throwIfAborted();
  }

  private sourceMatchesGene(source: { title?: string; content?: string; url?: string }): boolean {
    const geneSymbol = this.config.geneSymbol.trim().toLowerCase();
    if (!geneSymbol) return false;
    const searchable = [source.title, source.content, source.url].filter(Boolean).join('\n').toLowerCase();
    const organism = this.config.organism.trim().toLowerCase();
    const genus = organism.split(/\s+/)[0];
    const mentionsOrganism = !organism
      || searchable.includes(organism)
      || (genus.length > 3 && searchable.includes(genus));
    const mentionsIdentity = Array.from(this.identityTerms).some(term => term.length > 2 && searchable.includes(term));
    return mentionsOrganism && (searchable.includes(geneSymbol) || mentionsIdentity);
  }

  async conductResearch(): Promise<GeneResearchResult> {
    const startTime = Date.now();
    
    try {
      this.assertNotCancelled();
      // Phase 1: Generate research queries
      console.log('Phase 1: Generating research queries...');
      const queries = this.generateResearchQueries();
      this.searchAttempts = [];
      this.identityTerms = new Set([
        this.config.geneSymbol,
        this.config.target?.locusTag,
        this.config.target?.proteinId,
      ].filter(Boolean).map(value => String(value).trim().toLowerCase()));
      this.assertNotCancelled();

      // Phase 2a: resolve the immutable CDS target once. Identity databases
      // are not research-query engines; repeatedly asking them the same
      // symbol for every focus area creates activity without new evidence.
      console.log('Phase 2a: Resolving exact target identity...');
      const searchResults = await this.resolveTargetIdentity();

      // Phase 2b: run each research question through its specialist adapter
      // and the configured academic discovery provider. Discovery is always
      // executed (not only as an empty-result fallback), so a successful
      // identity lookup cannot accidentally suppress literature research.
      console.log('Phase 2b: Executing research searches...');
      const initialResults = await this.executeSearches(queries, 'research');
      this.mergeSearchResultMaps(searchResults, initialResults);
      await this.retrieveDiscoveryContent(searchResults);

      // Phase 2c: inspect actual coverage and issue bounded follow-ups for
      // missing high-priority evidence. Stop early when a round adds no new
      // sources, which makes depth evidence-driven rather than time-driven.
      const allResearchQueries = [...queries];
      let followUpQueryCount = 0;
      for (let round = 1; round <= 2; round += 1) {
        const coverageBefore = this.assessEvidenceCoverage(searchResults, allResearchQueries);
        const followUpQueries = this.buildEvidenceGapQueries(
          coverageBefore,
          allResearchQueries,
          round
        ).slice(0, 4);
        if (followUpQueries.length === 0) break;

        console.log(`Phase 2c.${round}: Executing ${followUpQueries.length} evidence-gap follow-up searches...`);
        const sourcesBefore = this.countUniqueSources(searchResults);
        const followUpResults = await this.executeSearches(followUpQueries, 'follow_up');
        this.mergeSearchResultMaps(searchResults, followUpResults);
        await this.retrieveDiscoveryContent(followUpResults);
        allResearchQueries.push(...followUpQueries);
        followUpQueryCount += followUpQueries.length;
        if (this.countUniqueSources(searchResults) <= sourcesBefore) break;
      }
      this.assertNotCancelled();
      
      // Phase 3: Extract and process data
      console.log('Phase 3: Extracting and processing data...');
      const extractedData = await this.extractAndProcessData(searchResults);
      this.assertNotCancelled();
      
      // Phase 4: API integration (if enabled)
      let apiData = null;
      if (this.config.enableAPIIntegration && !this.config.target) {
        console.log('Phase 4: Integrating API data...');
        apiData = await this.integrateAPIData();
        this.assertNotCancelled();
        if (apiData) {
          this.mergeAPIData(extractedData, apiData);
        }
      }

      const coverage = this.assessEvidenceCoverage(searchResults, allResearchQueries);
      
      // Phase 5: Generate visualizations
      let visualizations: any[] = [];
      if (this.config.enableVisualization) {
        console.log('Phase 5: Generating visualizations...');
        visualizations = this.generateVisualizations(extractedData);
      }
      
      // Phase 6: Quality control
      let qualityMetrics: GeneResearchQualityMetrics;
      if (this.config.enableQualityControl) {
        console.log('Phase 6: Performing quality control...');
        qualityMetrics = this.performQualityControl(extractedData);
      } else {
        qualityMetrics = this.getDefaultQualityMetrics();
      }
      
      // Phase 7: Generate report
      console.log('Phase 7: Generating research report...');
      const report = this.generateReport(extractedData, visualizations, qualityMetrics, coverage);
      this.assertNotCancelled();
      
      // Phase 8: Compile workflow
      const workflow = this.compileWorkflow(extractedData);
      
      const researchTime = Date.now() - startTime;
      const sources = this.rankSources(this.dedupeSources(
        Array.from(searchResults.values()).flatMap((result: any) => result?.sources || [])
      ));
      const successfulSearches = this.searchAttempts.filter(attempt => attempt.status === 'success').length;
      
      return {
        workflow,
        qualityMetrics,
        visualizations,
        report,
        sources,
        metadata: {
          researchTime,
          dataSources: this.getDataSources(searchResults, apiData),
          confidence: qualityMetrics.overallQuality,
          completeness: qualityMetrics.dataCompleteness,
          searchDiagnostics: {
            queryCount: allResearchQueries.length,
            followUpQueryCount,
            attemptedSearches: this.searchAttempts.length,
            successfulSearches,
            sourceCount: sources.length,
            uniqueSourceCount: sources.length,
            attempts: this.searchAttempts,
            identityResolved: coverage.identityResolved,
            authoritativeSourceCount: coverage.authoritativeSourceCount,
            literatureSourceCount: coverage.literatureSourceCount,
            discoverySourceCount: coverage.discoverySourceCount,
            retrievedContentCount: coverage.retrievedContentCount,
            degradedProviders: coverage.degradedProviders,
            coverageByCategory: coverage.coverageByCategory,
            evidenceGaps: coverage.evidenceGaps,
          },
        }
      };
    } catch (error) {
      console.error('Gene research error:', error);
      throw new Error(`Gene research failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateResearchQueries(): GeneSearchTask[] {
    const requestedAspects = [
      ...(this.config.researchFocus || []),
      ...(this.config.specificAspects || []),
    ];
    if (requestedAspects.length > 0) {
      return this.queryGenerator.generateFocusedQueries(requestedAspects);
    }
    return this.queryGenerator.generateComprehensiveQueries();
  }

  private async resolveTargetIdentity(): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    const enabled = new Set(this.config.searchProviders || []);
    const providers = [
      { provider: 'uniprot', query: `${this.config.geneSymbol} exact protein identity ${this.config.organism}` },
      { provider: 'ncbi_gene', query: `${this.config.target?.locusTag || this.config.geneSymbol} exact gene identity ${this.config.organism}` },
      { provider: 'kegg', query: `${this.config.target?.locusTag || this.config.geneSymbol} exact pathway identity ${this.config.organism}` },
    ].filter(item => enabled.size === 0 || enabled.has(item.provider));

    for (const item of providers) {
      this.assertNotCancelled();
      const startedAt = Date.now();
      this.config.onProgress?.({
        step: 'gene-search', status: 'start', phase: 'identity', name: item.query, provider: item.provider,
      });
      try {
        const result = await createGeneSearchProvider({
          provider: item.provider,
          query: item.query,
          geneSymbol: this.config.geneSymbol,
          organism: this.config.organism,
          locusTag: this.config.target?.locusTag || undefined,
          proteinId: this.config.target?.proteinId || undefined,
          taxonId: this.config.target?.taxonId || undefined,
          assemblyAccession: this.config.target?.assemblyAccession || undefined,
          proteinSha256: this.config.target?.proteinSha256 || undefined,
          maxResult: this.config.maxSearchResults || 10,
          signal: this.config.signal,
        } as any);
        const error = result?.metadata?.error;
        const status = error ? 'error' : result?.sources?.length ? 'success' : 'empty';
        this.searchAttempts.push({
          query: item.query,
          provider: item.provider,
          phase: 'identity',
          category: 'basic_info',
          sourceCount: result?.sources?.length || 0,
          durationMs: Date.now() - startedAt,
          status,
          error,
        });
        const sources = (result?.sources || []).map((source: any) => {
          const exact = source.targetMatch === true;
          const sourceId = source.sourceId || source.provenance?.recordId || source.url;
          const fieldEvidence = source.annotation
            ? Object.fromEntries(
                Object.entries(source.annotation)
                  .filter(([key, value]) => ['product', 'ecNumbers', 'goTerms', 'koTerms', 'pathwayTerms', 'dbXrefs'].includes(key) && value)
                  .map(([key, value]) => [key, (Array.isArray(value) ? value : [value]).map(item => ({
                    value: String(item),
                    sourceId,
                    database: source.database,
                    url: source.url,
                    retrievedAt: new Date().toISOString(),
                  }))])
              )
            : undefined;
          return {
            ...source,
            sourceId,
            authoritative: exact && Boolean(source.annotation),
            target: exact ? this.config.target : undefined,
            annotation: source.annotation
              ? { ...source.annotation, ...(fieldEvidence ? { fieldEvidence } : {}) }
              : source.annotation,
            researchCategory: 'basic_info',
            evidenceRole: exact ? 'authoritative' : 'reference',
            contentKind: source.structuredData ? 'structured-record' : 'record',
          };
        });
        for (const source of sources) {
          if (source.targetMatch !== true && this.config.target) continue;
          [
            source.annotation?.product,
            source.verifiedIdentity?.geneSymbol,
            source.verifiedIdentity?.locusTag,
            source.verifiedIdentity?.proteinId,
          ].filter(Boolean).forEach(term => this.identityTerms.add(String(term).trim().toLowerCase()));
        }
        results.set(`identity:${item.provider}`, {
          ...result,
          sources,
          metadata: { ...(result?.metadata || {}), category: 'basic_info', phase: 'identity' },
        });
        this.config.onProgress?.({
          step: 'gene-search', status: error ? 'error' : 'end', phase: 'identity', name: item.query,
          provider: item.provider, sourceCount: sources.length, error,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.searchAttempts.push({
          query: item.query,
          provider: item.provider,
          phase: 'identity',
          category: 'basic_info',
          sourceCount: 0,
          durationMs: Date.now() - startedAt,
          status: 'error',
          error: message,
        });
        this.config.onProgress?.({
          step: 'gene-search', status: 'error', phase: 'identity', name: item.query,
          provider: item.provider, error: message,
        });
      }
    }
    return results;
  }

  private mergeSearchResultMaps(target: Map<string, any>, incoming: Map<string, any>): void {
    for (const [key, value] of incoming) {
      const current = target.get(key);
      if (!current) {
        target.set(key, value);
        continue;
      }
      target.set(key, {
        ...current,
        ...value,
        sources: this.dedupeSources([...(current.sources || []), ...(value.sources || [])]),
        images: [...(current.images || []), ...(value.images || [])],
        metadata: { ...(current.metadata || {}), ...(value.metadata || {}) },
      });
    }
  }

  private countUniqueSources(searchResults: Map<string, any>): number {
    return this.dedupeSources(
      Array.from(searchResults.values()).flatMap((result: any) => result?.sources || [])
    ).length;
  }

  private assessEvidenceCoverage(
    searchResults: Map<string, any>,
    queries: GeneSearchTask[]
  ): ResearchCoverage {
    const sources = this.dedupeSources(
      Array.from(searchResults.values()).flatMap((result: any) => result?.sources || [])
    );
    const authoritativeSources = sources.filter(source => source?.targetMatch === true && source?.annotation);
    const literatureSources = sources.filter(source =>
      source?.database === 'pubmed'
      && (source?.structuredData?.literatureReferences?.length || source?.contentKind === 'abstract')
    );
    const discoverySources = sources.filter(source => source?.evidenceRole === 'discovery');
    const retrievedSources = sources.filter(source => source?.contentKind === 'retrieved-content');
    const coverageByCategory: ResearchCoverage['coverageByCategory'] = {};

    for (const query of queries) {
      const category = query.category || 'basic_info';
      coverageByCategory[category] ||= { queries: 0, sources: 0, literatureSources: 0, fullContentSources: 0 };
      coverageByCategory[category].queries += 1;
    }
    for (const source of sources) {
      const category = String(source?.researchCategory || 'basic_info');
      coverageByCategory[category] ||= { queries: 0, sources: 0, literatureSources: 0, fullContentSources: 0 };
      coverageByCategory[category].sources += 1;
      if (source?.database === 'pubmed' && source?.structuredData?.literatureReferences?.length) {
        coverageByCategory[category].literatureSources += 1;
      }
      if (source?.contentKind === 'retrieved-content' || source?.contentKind === 'abstract') {
        coverageByCategory[category].fullContentSources += 1;
      }
    }

    const evidenceGaps: string[] = [];
    if (this.config.target && authoritativeSources.length === 0) {
      evidenceGaps.push('exact_target_identity:not_resolved');
    }
    const highPriorityCategories = new Set(
      queries.filter(query => query.priority === 'high').map(query => query.category)
    );
    for (const category of highPriorityCategories) {
      const categoryCoverage = coverageByCategory[category];
      if (!categoryCoverage || categoryCoverage.sources === 0) {
        evidenceGaps.push(`${category}:no_sources`);
      } else if (
        category !== 'basic_info'
        && categoryCoverage.literatureSources === 0
        && categoryCoverage.fullContentSources === 0
      ) {
        evidenceGaps.push(`${category}:no_literature_or_full_content`);
      }
    }

    return {
      identityResolved: this.config.target ? authoritativeSources.length > 0 : sources.length > 0,
      authoritativeSourceCount: authoritativeSources.length,
      literatureSourceCount: literatureSources.length,
      discoverySourceCount: discoverySources.length,
      retrievedContentCount: retrievedSources.length,
      degradedProviders: Array.from(new Set(
        this.searchAttempts.filter(attempt => attempt.status === 'error').map(attempt => attempt.provider)
      )),
      coverageByCategory,
      evidenceGaps,
    };
  }

  private buildEvidenceGapQueries(
    coverage: ResearchCoverage,
    existingQueries: GeneSearchTask[],
    round: number
  ): GeneSearchTask[] {
    const gene = this.config.geneSymbol;
    const organism = this.config.organism;
    const product = Array.from(this.identityTerms)
      .find(term => term !== gene.toLowerCase() && term !== String(this.config.target?.locusTag || '').toLowerCase());
    const subject = product || gene;
    const templates: Record<string, string> = {
      basic_info: `${gene} ${this.config.target?.locusTag || ''} ${this.config.target?.proteinId || ''} accession locus identity ${organism}`,
      function: `${subject} biochemical characterization enzyme kinetics substrate catalytic mechanism ${organism}`,
      structure: `${subject} crystal structure active site catalytic residues ${organism}`,
      expression: `${gene} transcription expression growth conditions stress response ${organism}`,
      interactions: `${gene} operon regulation interaction partners ${organism}`,
      disease: `${gene} mutation phenotype functional evidence ${organism}`,
      evolution: `${subject} ortholog phylogeny functional conservation ${organism}`,
      pathway: `${gene} knockout mutant phenotype biosynthetic pathway metabolic flux ${organism}`,
    };
    const gapCategories = Array.from(new Set(coverage.evidenceGaps.map(gap => gap.split(':')[0])));
    const existing = new Set(existingQueries.map(query => `${query.database}:${query.query}`.toLowerCase()));
    return gapCategories.flatMap(category => {
      const base = templates[category];
      if (!base) return [];
      const query = round === 1 ? base : `${base} primary experimental study`;
      const candidate: GeneSearchTask = {
        query: query.replace(/\s+/g, ' ').trim(),
        researchGoal: `Close the unresolved ${category} evidence gap using target-specific primary literature.`,
        database: 'pubmed',
        priority: 'high',
        category: category as GeneSearchTask['category'],
        status: 'pending',
      };
      const key = `${candidate.database}:${candidate.query}`.toLowerCase();
      if (existing.has(key)) return [];
      existing.add(key);
      return [candidate];
    });
  }

  private async retrieveDiscoveryContent(searchResults: Map<string, any>): Promise<void> {
    const candidates = this.rankSources(this.dedupeSources(
      Array.from(searchResults.values()).flatMap((result: any) => result?.sources || [])
    ))
      .filter(source => source?.evidenceRole === 'discovery' && source?.contentKind === 'snippet' && source?.url)
      .slice(0, 4);

    await Promise.all(candidates.map(async source => {
      this.assertNotCancelled();
      const startedAt = Date.now();
      try {
        const response = await fetchPublicText(source.url, { maxBytes: 1_500_000, timeoutMs: 12_000 });
        const content = this.htmlToText(response.body).slice(0, 40_000);
        if (content.length < 200) throw new Error('Retrieved page did not contain substantive text');
        source.content = content;
        source.contentKind = 'retrieved-content';
        source.evidenceRole = 'context';
        source.retrievedAt = new Date().toISOString();
        this.searchAttempts.push({
          query: source.url,
          provider: 'content-retrieval',
          phase: 'retrieval',
          category: source.researchCategory,
          sourceCount: 1,
          durationMs: Date.now() - startedAt,
          status: 'success',
        });
      } catch (error) {
        this.searchAttempts.push({
          query: source.url,
          provider: 'content-retrieval',
          phase: 'retrieval',
          category: source.researchCategory,
          sourceCount: 0,
          durationMs: Date.now() - startedAt,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }));
  }

  private htmlToText(value: string): string {
    return value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#(?:39|x27);/gi, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  private dedupeSources(sources: any[]): any[] {
    const seen = new Set<string>();
    return sources.filter(source => {
      const key = String(
        source?.sourceId
        || source?.recordId
        || source?.verifiedIdentity?.recordId
        || source?.url
        || `${source?.database || 'unknown'}:${source?.title || ''}`
      ).toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private rankSources(sources: any[]): any[] {
    const authoritativeProducts = sources
      .map(source => source?.annotation?.product)
      .filter(Boolean)
      .map((product: string) => product.toLowerCase());
    const gene = this.config.geneSymbol.toLowerCase();
    const organism = this.config.organism.toLowerCase();
    const requestedGenus = organism.split(/\s+/)[0];
    const organismAliases = organism === 'escherichia coli' ? ['escherichia coli', 'e. coli'] : [organism];
    const otherGenera = ['corynebacterium', 'bacillus', 'pseudomonas', 'salmonella', 'staphylococcus', 'streptococcus']
      .filter(genus => genus !== requestedGenus);
    const score = (source: any) => {
      const title = String(source?.title || '').toLowerCase();
      const content = String(source?.content || '').toLowerCase();
      let value = 0;
      if (source?.annotation?.reviewed) value += 100;
      else if (source?.annotation) value += 80;
      if (source?.database === 'ncbi_gene') value += 60;
      if (title.includes(gene)) value += 25;
      if (organismAliases.some(alias => title.includes(alias))) value += 25;
      if (otherGenera.some(genus => title.includes(genus)) && !organismAliases.some(alias => title.includes(alias))) value -= 30;
      if (authoritativeProducts.some(product => title.includes(product))) value += 35;
      if (content.includes(gene)) value += 10;
      if (content.includes(organism)) value += 10;
      if (authoritativeProducts.some(product => content.includes(product))) value += 15;
      if (/functional|biochemical|catalytic|kinetic|crystal structure/i.test(title)) value += 12;
      return value;
    };
    return [...sources].sort((left, right) => score(right) - score(left));
  }

  private async executeSearches(
    queries: GeneSearchTask[],
    phase: 'research' | 'follow_up' = 'research'
  ): Promise<Map<string, any>> {
    const searchResults = new Map<string, any>();
    const searchProviders = this.config.searchProviders || ['pubmed', 'uniprot', 'ncbi_gene', 'geo', 'pdb', 'kegg', 'string', 'omim', 'ensembl', 'reactome'];
    for (const query of queries) {
      this.assertNotCancelled();
      try {
        const provider = query.database || 'pubmed';
        this.config.onProgress?.({
          step: 'gene-search', status: 'start', phase, category: query.category,
          name: query.query, provider,
        });
        let result: any = null;
        if (searchProviders.includes(provider) && !new Set(['uniprot', 'ncbi_gene', 'kegg']).has(provider)) {
          const attemptStartedAt = Date.now();
          try {
            result = await createGeneSearchProvider({
              provider,
              query: query.query,
              geneSymbol: this.config.geneSymbol,
              organism: this.config.organism,
              locusTag: this.config.target?.locusTag || undefined,
              proteinId: this.config.target?.proteinId || undefined,
              taxonId: this.config.target?.taxonId || undefined,
              assemblyAccession: this.config.target?.assemblyAccession || undefined,
              proteinSha256: this.config.target?.proteinSha256 || undefined,
              maxResult: this.config.maxSearchResults || 10,
              signal: this.config.signal,
            } as any);
            if (result?.sources) {
              result.sources = result.sources.map((source: any) => ({
                ...source,
                researchCategory: query.category,
                evidenceRole: source.annotation && source.targetMatch === true ? 'authoritative' : 'reference',
                contentKind: source.structuredData?.literatureReferences ? 'abstract' : 'structured-record',
              }));
            }
            this.searchAttempts.push({
              query: query.query,
              provider,
              phase,
              category: query.category,
              sourceCount: result?.sources?.length || 0,
              durationMs: Date.now() - attemptStartedAt,
              status: result?.metadata?.error ? 'error' : result?.sources?.length ? 'success' : 'empty',
              error: result?.metadata?.error,
            });
          } catch (error) {
            console.error(`Primary ${provider} search failed for query "${query.query}":`, error);
            this.searchAttempts.push({
              query: query.query,
              provider,
              phase,
              category: query.category,
              sourceCount: 0,
              durationMs: Date.now() - attemptStartedAt,
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // The MCP-configured provider (for example a local SearxNG instance)
        // supplies web/literature evidence when a curated database returns no
        // records. This keeps specialist APIs preferred while ensuring the
        // global DGR search configuration is actually honoured.
        const fallback = this.config.fallbackSearchProvider;
        if (fallback && fallback.provider !== 'model') {
          const fallbackStartedAt = Date.now();
          try {
            const fallbackResult = await createSearchProvider({
              provider: fallback.provider,
              baseURL: fallback.baseURL,
              apiKey: fallback.apiKey,
              query: query.query,
              maxResult: fallback.maxResult || this.config.maxSearchResults || 10,
              scope: fallback.scope || (fallback.provider === 'searxng' ? 'academic' : undefined),
              signal: this.config.signal,
            });
            const relevantSources = fallbackResult.sources.filter(source => this.sourceMatchesGene(source));
            this.searchAttempts.push({
              query: query.query,
              provider: fallback.provider,
              phase,
              category: query.category,
              sourceCount: relevantSources.length,
              durationMs: Date.now() - fallbackStartedAt,
              status: relevantSources.length ? 'success' : 'empty',
            });
            const discoverySources = relevantSources.map(source => ({
              title: source.title || query.query,
              content: source.content || '',
              url: source.url,
              database: fallback.provider,
              geneSymbol: this.config.geneSymbol,
              organism: this.config.organism,
              confidence: 0.6,
              evidence: ['search-discovery'],
              targetMatch: false,
              provenance: { provider: fallback.provider, matchedBy: ['search-discovery'] },
              researchCategory: query.category,
              evidenceRole: 'discovery',
              contentKind: 'snippet',
              type: 'literature' as const,
            }));
            result = {
              ...(result || {}),
              sources: this.dedupeSources([...(result?.sources || []), ...discoverySources]),
              images: [...(result?.images || []), ...(fallbackResult.images || [])],
              metadata: {
                ...(result?.metadata || {}),
                totalResults: (result?.sources?.length || 0) + relevantSources.length,
                relevantResults: relevantSources.length,
                database: result?.metadata?.database || fallback.provider,
                searchTime: Date.now(),
                geneSymbol: this.config.geneSymbol,
                organism: this.config.organism,
                category: query.category,
              },
            };
          } catch (error) {
            this.searchAttempts.push({
              query: query.query,
              provider: fallback.provider,
              phase,
              category: query.category,
              sourceCount: 0,
              durationMs: Date.now() - fallbackStartedAt,
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (result) {
          searchResults.set(`${phase}:${query.category}:${query.query}`, result);
          this.assertNotCancelled();
        }
        this.config.onProgress?.({
          step: 'gene-search',
          phase,
          category: query.category,
          status: 'end',
          name: query.query,
          provider: result?.metadata?.database || provider,
          sourceCount: result?.sources?.length || 0,
        });
      } catch (error) {
        console.error(`Search error for query "${query.query}":`, error);
        this.config.onProgress?.({
          step: 'gene-search', phase, category: query.category, status: 'error', name: query.query,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return searchResults;
  }

  private async extractAndProcessData(searchResults: Map<string, any>): Promise<GeneDataExtractionResult> {
    const extractedData: Partial<GeneDataExtractionResult> = {
      geneBasicInfo: {
        geneSymbol: this.config.geneSymbol,
        organism: this.config.organism,
        geneID: '',
        alternativeNames: [],
        chromosomalLocation: '',
        genomicCoordinates: {
          chromosome: '',
          start: 0,
          end: 0,
          strand: '+' as const
        },
        geneType: 'protein_coding',
        description: ''
      },
      functionalData: {
        molecularFunction: [],
        biologicalProcess: [],
        cellularComponent: [],
        catalyticActivity: '',
        substrateSpecificity: '',
        bindingSites: [],
        enzymeClassification: ''
      },
      proteinInfo: {
        uniprotId: '',
        proteinName: '',
        proteinSize: 0,
        molecularWeight: 0,
        isoelectricPoint: 0,
        subcellularLocation: [],
        proteinDomains: [],
        bindingSites: [],
        catalyticActivity: '',
        cofactors: [],
        postTranslationalModifications: []
      },
      expressionData: {
        tissueSpecificity: [],
        developmentalStage: [],
        environmentalResponse: [],
        expressionLevel: { high: [], medium: [], low: [] },
        regulation: []
      },
      interactionData: {
        proteinInteractions: [],
        dnaInteractions: [],
        rnaInteractions: [],
        smallMoleculeInteractions: [],
        complexes: []
      },
      diseaseData: [],
      evolutionaryData: {
        orthologs: [],
        paralogs: [],
        geneFamily: '',
        conservation: {
          overallConservation: 'medium',
          conservedDomains: [],
          variableRegions: [],
          functionalConservation: 'medium'
        },
        duplicationEvents: []
      },
      literatureReferences: [],
      qualityScore: 0,
      extractionMetadata: {
        extractionTime: 0,
        sources: [],
        confidence: 0,
        completeness: 0
      }
    };

    const structuredSources: any[] = [];
    // Process each unique source once. Multiple focused queries often return
    // the same authoritative record and must not inflate evidence or runtime.
    const sourcesToProcess = this.rankSources(this.dedupeSources(
      Array.from(searchResults.values()).flatMap((result: any) => result?.sources || [])
    ));
    for (const source of sourcesToProcess) {
      this.assertNotCancelled();
      // Search snippets are discovery leads, not annotation evidence. They
      // must not feed the heuristic extractor or create claims from isolated
      // EC/GO/pathway strings.
      if (source.evidenceRole === 'discovery' && source.contentKind === 'snippet') continue;
      if (this.config.target && source.annotation && source.targetMatch !== true) continue;
      if (source.structuredData) structuredSources.push(source);
      const content = `${source.title}\n${source.content}`;
      const partialData = await this.dataExtractor.extractFromContent(content, source.database || 'unknown');
      this.assertNotCancelled();

      // Merge extracted data
      this.mergeExtractedData(extractedData, partialData);
    }

    // Apply machine-readable database records after heuristic text
    // extraction. Reviewed records replace noisy inferred arrays, while
    // literature records continue to merge additively.
    structuredSources
      .sort((left, right) => Number(Boolean(left.annotation?.reviewed)) - Number(Boolean(right.annotation?.reviewed)))
      .forEach(source => this.mergeExtractedData(extractedData, source.structuredData, Boolean(source.annotation?.reviewed)));

    const seenReferences = new Set<string>();
    extractedData.literatureReferences = (extractedData.literatureReferences || []).filter(reference => {
      const key = String(reference.pmid || reference.title || '').trim().toLowerCase();
      if (!key || seenReferences.has(key)) return false;
      seenReferences.add(key);
      return true;
    });

    return extractedData as GeneDataExtractionResult;
  }

  private mergeExtractedData(
    target: Partial<GeneDataExtractionResult>,
    source: Partial<GeneDataExtractionResult>,
    replaceArrays = false
  ): void {
    const mergeNonEmpty = (destination: Record<string, any>, incoming: Record<string, any>) => {
      for (const [key, value] of Object.entries(incoming || {})) {
        if (value === undefined || value === null || value === '') continue;
        if (Array.isArray(value) && value.length === 0) continue;
        if (Array.isArray(value)) {
          if (replaceArrays) {
            destination[key] = [...value];
            continue;
          }
          const current = Array.isArray(destination[key]) ? destination[key] : [];
          const seen = new Set(current.map((item: any) => JSON.stringify(item)));
          destination[key] = [...current, ...value.filter(item => {
            const identity = JSON.stringify(item);
            if (seen.has(identity)) return false;
            seen.add(identity);
            return true;
          })];
          continue;
        }
        if (typeof value === 'object' && !Array.isArray(value)) {
          const current = destination[key];
          if (!current || typeof current !== 'object' || Array.isArray(current)) destination[key] = {};
          mergeNonEmpty(destination[key], value as Record<string, any>);
          continue;
        }
        destination[key] = value;
      }
    };

    // Merge gene basic info
    if (source.geneBasicInfo) {
      mergeNonEmpty(target.geneBasicInfo! as Record<string, any>, source.geneBasicInfo as Record<string, any>);
    }

    // Merge functional data
    if (source.functionalData) {
      mergeNonEmpty(target.functionalData! as Record<string, any>, source.functionalData as Record<string, any>);
    }

    // Merge protein info
    if (source.proteinInfo) {
      mergeNonEmpty(target.proteinInfo! as Record<string, any>, source.proteinInfo as Record<string, any>);
    }

    // Merge expression data
    if (source.expressionData) {
      mergeNonEmpty(target.expressionData! as Record<string, any>, source.expressionData as Record<string, any>);
    }

    // Merge interaction data
    if (source.interactionData) {
      mergeNonEmpty(target.interactionData! as Record<string, any>, source.interactionData as Record<string, any>);
    }

    // Merge disease data
    if (source.diseaseData) {
      target.diseaseData!.push(...source.diseaseData);
    }

    // Merge evolutionary data
    if (source.evolutionaryData) {
      mergeNonEmpty(target.evolutionaryData! as Record<string, any>, source.evolutionaryData as Record<string, any>);
    }

    // Merge literature references
    if (source.literatureReferences) {
      target.literatureReferences!.push(...source.literatureReferences);
    }
  }

  private async integrateAPIData(): Promise<any> {
    try {
      return await this.apiIntegrations.fetchAllData();
    } catch (error) {
      console.error('API integration error:', error);
      return null;
    }
  }

  private mergeAPIData(extractedData: GeneDataExtractionResult, apiData: any): void {
    const successfulSources = Object.entries(apiData || {})
      .filter(([, result]: [string, any]) => result?.success)
      .map(([source]) => source);

    extractedData.extractionMetadata.sources = Array.from(
      new Set([...(extractedData.extractionMetadata.sources || []), ...successfulSources])
    );

    const ncbiGene = apiData?.ncbi?.data?.gene;
    if (apiData?.ncbi?.success && ncbiGene) {
      extractedData.geneBasicInfo.geneID ||= ncbiGene.id || '';
      extractedData.geneBasicInfo.description ||= ncbiGene.description || ncbiGene.summary || '';
      extractedData.geneBasicInfo.alternativeNames = Array.from(
        new Set([
          ...extractedData.geneBasicInfo.alternativeNames,
          ncbiGene.name,
        ].filter(Boolean))
      );
    }

    const ncbiProtein = apiData?.ncbi?.data?.protein;
    if (ncbiProtein) {
      extractedData.proteinInfo.proteinName ||= ncbiProtein.definition || '';
      extractedData.proteinInfo.proteinSize ||= ncbiProtein.length || 0;
    }

    const uniProtProtein = apiData?.uniprot?.data?.protein;
    if (apiData?.uniprot?.success && uniProtProtein) {
      extractedData.proteinInfo.uniprotId ||= uniProtProtein.primaryAccession || uniProtProtein.uniProtkbId || '';
      extractedData.proteinInfo.proteinName ||= uniProtProtein.proteinDescription?.recommendedName?.fullName?.value || '';
      const functionComment = uniProtProtein.comments?.find((comment: any) => comment.commentType === 'FUNCTION');
      const functionText = functionComment?.texts?.[0]?.value || functionComment?.text?.[0]?.value;
      if (functionText && !extractedData.functionalData.molecularFunction.includes(functionText)) {
        extractedData.functionalData.molecularFunction.push(functionText);
      }
    }

    const stringInteractions = apiData?.string?.data?.interactions;
    if (Array.isArray(stringInteractions) && stringInteractions.length > 0) {
      extractedData.interactionData.proteinInteractions.push(
        ...stringInteractions.slice(0, 25).map((interaction: any) => ({
          partner: interaction.preferredNameB || interaction.stringIdB,
          partnerSymbol: interaction.preferredNameB || interaction.stringIdB,
          interactionType: 'functional' as const,
          strength: Number(interaction.combinedScore || interaction.score || 0) > 0.7 ? 'strong' as const : 'medium' as const,
          evidence: ['STRING'],
          confidence: Number(interaction.combinedScore || interaction.score || 0) > 0.7 ? 'high' as const : 'medium' as const,
          source: 'STRING'
        }))
      );
    }

    const keggPathways = apiData?.kegg?.data?.pathways;
    if (Array.isArray(keggPathways) && keggPathways.length > 0) {
      extractedData.functionalData.biologicalProcess.push(
        ...keggPathways.map((pathway: any) => `KEGG pathway ${pathway.id}`).filter(Boolean)
      );
    }
  }

  private generateVisualizations(extractedData: GeneDataExtractionResult): any[] {
    try {
      return this.visualizationGenerator.generateAllVisualizations(
        extractedData.geneBasicInfo,
        extractedData.functionalData,
        extractedData.proteinInfo,
        extractedData.expressionData,
        extractedData.interactionData,
        extractedData.diseaseData,
        extractedData.evolutionaryData
      );
    } catch (error) {
      console.error('Visualization generation error:', error);
      return [];
    }
  }

  private performQualityControl(extractedData: GeneDataExtractionResult): GeneResearchQualityMetrics {
    try {
      const qualityResult = this.qualityControl.assessQuality(
        extractedData.geneBasicInfo,
        extractedData.functionalData,
        extractedData.proteinInfo,
        extractedData.expressionData,
        extractedData.interactionData,
        extractedData.diseaseData,
        extractedData.evolutionaryData,
        extractedData.literatureReferences
      );

      return {
        dataCompleteness: qualityResult.categoryScores.dataCompleteness,
        literatureCoverage: qualityResult.categoryScores.literatureCoverage,
        experimentalEvidence: qualityResult.categoryScores.experimentalEvidence,
        crossSpeciesValidation: qualityResult.categoryScores.crossSpeciesValidation,
        databaseConsistency: qualityResult.categoryScores.databaseConsistency,
        overallQuality: qualityResult.overallScore
      };
    } catch (error) {
      console.error('Quality control error:', error);
      return this.getDefaultQualityMetrics();
    }
  }

  private getDefaultQualityMetrics(): GeneResearchQualityMetrics {
    return {
      dataCompleteness: 0.5,
      literatureCoverage: 0.5,
      experimentalEvidence: 0.5,
      crossSpeciesValidation: 0.5,
      databaseConsistency: 0.5,
      overallQuality: 0.5
    };
  }

  private generateReport(
    extractedData: GeneDataExtractionResult,
    visualizations: any[],
    qualityMetrics: GeneResearchQualityMetrics,
    coverage?: ResearchCoverage
  ): any {
    const basic = extractedData.geneBasicInfo;
    const functional = extractedData.functionalData;
    const protein = extractedData.proteinInfo;
    const references = extractedData.literatureReferences || [];
    const hasEvidence = Boolean(
      protein.proteinName
      || protein.uniprotId
      || functional.molecularFunction.length
      || functional.catalyticActivity
      || references.length
    );
    const bullet = (label: string, value: unknown) => {
      const formatted = Array.isArray(value) ? value.filter(Boolean).join('; ') : String(value || '').trim();
      return formatted ? `- **${label}**: ${formatted}` : '';
    };
    const evidenceSummary = hasEvidence
      ? [
          protein.proteinName ? `${this.config.geneSymbol} encodes ${protein.proteinName}.` : '',
          functional.catalyticActivity || functional.molecularFunction[0] || '',
          functional.biologicalProcess[0] || '',
        ].filter(Boolean).join(' ')
      : `No source-backed functional evidence was retrieved for ${this.config.geneSymbol} in ${this.config.organism}. The pipeline did not infer missing biology.`;
    const identityLines = [
      bullet('Gene symbol', basic.geneSymbol || this.config.geneSymbol),
      bullet('Organism', basic.organism || this.config.organism),
      bullet('NCBI Gene ID', basic.geneID),
      bullet('Alternative names', basic.alternativeNames),
      bullet('Protein product', protein.proteinName),
      bullet('UniProtKB', protein.uniprotId),
      bullet('Protein length', protein.proteinSize ? `${protein.proteinSize} aa` : ''),
      bullet('Molecular weight', protein.molecularWeight ? `${protein.molecularWeight} Da` : ''),
    ].filter(Boolean).join('\n');
    const functionLines = [
      bullet('Molecular function', functional.molecularFunction),
      bullet('Catalytic activity', functional.catalyticActivity),
      bullet('EC number', functional.enzymeClassification),
      bullet('Biological process/pathway', functional.biologicalProcess),
      bullet('Cellular component', functional.cellularComponent),
      bullet('Protein family/domains', protein.proteinDomains),
      bullet('Subcellular location', protein.subcellularLocation),
    ].filter(Boolean).join('\n');
    const referenceLines = references.length
      ? references.map(reference => {
          const pmid = reference.pmid ? ` PMID:${reference.pmid}.` : '';
          return `- ${reference.title}.${pmid}`;
        }).join('\n')
      : '- No validated literature references were retained.';
    const qualityLines = [
      bullet('Overall quality', `${(qualityMetrics.overallQuality * 100).toFixed(1)}%`),
      bullet('Data completeness', `${(qualityMetrics.dataCompleteness * 100).toFixed(1)}%`),
      bullet('Literature coverage', `${(qualityMetrics.literatureCoverage * 100).toFixed(1)}%`),
      bullet('Experimental evidence', `${(qualityMetrics.experimentalEvidence * 100).toFixed(1)}%`),
    ].join('\n');
    const coverageLines = coverage
      ? [
          `- **Identity resolved**: ${coverage.identityResolved ? 'yes' : 'no'}`,
          `- **Authoritative records**: ${coverage.authoritativeSourceCount}`,
          `- **Literature records**: ${coverage.literatureSourceCount}`,
          `- **Discovery records**: ${coverage.discoverySourceCount}`,
          `- **Retrieved pages**: ${coverage.retrievedContentCount}`,
          `- **Degraded providers**: ${coverage.degradedProviders.length ? coverage.degradedProviders.join(', ') : 'none'}`,
          coverage.evidenceGaps.length
            ? `- **Evidence gaps**: ${coverage.evidenceGaps.join('; ')}`
            : '- **Evidence gaps**: none detected in the requested high-priority areas',
        ].join('\n')
      : '';

    const sections: any[] = [
      {
        id: 'executive-summary', title: 'Executive Summary', priority: 'high', required: true,
        content: `## Executive Summary\n\n${evidenceSummary}`,
        visualizations: [],
      },
      {
        id: 'identity', title: 'Gene and Protein Identity', priority: 'high', required: true,
        content: `## Gene and Protein Identity\n\n${identityLines || 'No authoritative identity record was retrieved.'}`,
        visualizations: [],
      },
      {
        id: 'functional-annotation', title: 'Functional Annotation', priority: 'high', required: true,
        content: `## Functional Annotation\n\n${functionLines || 'No source-backed functional annotation was retrieved.'}`,
        visualizations: [],
      },
      {
        id: 'evidence', title: 'Evidence', priority: 'high', required: true,
        content: `## Evidence\n\n${referenceLines}`,
        visualizations: [],
      },
      {
        id: 'quality', title: 'Quality and Research Gaps', priority: 'high', required: true,
        content: `## Quality and Research Gaps\n\n${qualityLines}\n\n${coverageLines}\n\n${hasEvidence ? 'Unreported fields remain unset and require additional evidence.' : 'Annotation refinement is blocked until relevant evidence is retrieved.'}`,
        visualizations: [],
      },
    ];
    if (visualizations.length > 0 && hasEvidence) {
      sections[0].visualizations.push(...visualizations.filter(viz => viz.metadata?.geneSymbol === this.config.geneSymbol));
    }
    return {
      title: `Evidence-based Gene Function Research Report: ${this.config.geneSymbol} in ${this.config.organism}`,
      sections,
      metadata: {
        geneSymbol: this.config.geneSymbol,
        organism: this.config.organism,
        reportType: this.config.reportType || 'comprehensive',
        targetAudience: this.config.targetAudience || 'researchers',
        complexity: 'advanced',
      },
    };
  }

  private compileWorkflow(extractedData: GeneDataExtractionResult): GeneResearchWorkflow {
    return {
      geneIdentification: extractedData.geneBasicInfo,
      functionalAnalysis: extractedData.functionalData,
      proteinInfo: extractedData.proteinInfo,
      expressionAnalysis: extractedData.expressionData,
      regulatoryAnalysis: extractedData.expressionData.regulation || [],
      interactionAnalysis: extractedData.interactionData,
      diseaseAnalysis: extractedData.diseaseData,
      evolutionaryAnalysis: extractedData.evolutionaryData,
      literatureReview: extractedData.literatureReferences
    };
  }

  private getDataSources(searchResults: Map<string, any>, apiData: any): string[] {
    const sources = new Set<string>();

    // Add search result sources
    for (const result of searchResults.values()) {
      if (result.sources) {
        result.sources.forEach((source: any) => {
          if (source.database) {
            sources.add(source.database);
          }
        });
      }
    }

    // Add API sources
    if (apiData) {
      Object.keys(apiData).forEach(api => {
        if (apiData[api].success) {
          sources.add(api);
        }
      });
    }

    return Array.from(sources);
  }
}

// Factory function for creating gene research engine
export function createGeneResearchEngine(config: GeneResearchConfig): GeneResearchEngine {
  return new GeneResearchEngine(config);
}

// Utility functions for gene research
export function validateGeneResearchConfig(config: GeneResearchConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.geneSymbol || config.geneSymbol.trim() === '') {
    errors.push('Gene symbol is required');
  }

  if (!config.organism || config.organism.trim() === '') {
    errors.push('Organism is required');
  }

  if (config.geneSymbol && !/^[A-Za-z][A-Za-z0-9]*$/.test(config.geneSymbol)) {
    errors.push('Invalid gene symbol format');
  }

  if (config.maxSearchResults && (config.maxSearchResults < 1 || config.maxSearchResults > 100)) {
    errors.push('Max search results must be between 1 and 100');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Predefined research configurations
export const GENE_RESEARCH_PRESETS = {
  COMPREHENSIVE: {
    reportType: 'comprehensive' as const,
    targetAudience: 'researchers' as const,
    enableAPIIntegration: true,
    enableQualityControl: true,
    enableVisualization: true,
    maxSearchResults: 20,
    searchProviders: ['pubmed', 'uniprot', 'ncbi_gene', 'geo', 'pdb', 'kegg', 'string', 'omim', 'ensembl', 'reactome']
  },
  
  CLINICAL: {
    reportType: 'focused' as const,
    targetAudience: 'clinicians' as const,
    specificAspects: ['disease', 'therapeutic', 'clinical'],
    enableAPIIntegration: true,
    enableQualityControl: true,
    enableVisualization: true,
    maxSearchResults: 15,
    searchProviders: ['pubmed', 'uniprot', 'ncbi_gene']
  },
  
  EDUCATIONAL: {
    reportType: 'comprehensive' as const,
    targetAudience: 'students' as const,
    enableAPIIntegration: false,
    enableQualityControl: true,
    enableVisualization: true,
    maxSearchResults: 10,
    searchProviders: ['pubmed', 'uniprot', 'ncbi_gene']
  },
  
  QUICK: {
    reportType: 'focused' as const,
    targetAudience: 'researchers' as const,
    enableAPIIntegration: false,
    enableQualityControl: false,
    enableVisualization: false,
    maxSearchResults: 5,
    searchProviders: ['pubmed', 'uniprot']
  }
};

// Main gene research function for MCP Server
export async function conductGeneResearch(
  config: GeneResearchConfig
): Promise<GeneResearchResult> {
  const engine = new GeneResearchEngine(config);
  return await engine.conductResearch();
}

// Export all gene research utilities
export * from './query-generator';
export * from './search-providers';
export * from './data-extractor';
export * from './visualization-generators';
export * from './quality-control';
export * from './api-integrations';
export * from './report-templates';
