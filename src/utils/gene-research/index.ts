// Main gene research integration system
// Comprehensive gene research workflow orchestration

import { GeneQueryGenerator, createGeneQueryGenerator } from './query-generator';
import { createGeneSearchProvider } from './search-providers';
import { GeneDataExtractor } from './data-extractor';
import { GeneVisualizationGenerator, createGeneVisualizationGenerator } from './visualization-generators';
import { GeneResearchQualityControl, createGeneQualityControl } from './quality-control';
import { GeneAPIIntegrations, createGeneAPIIntegrations } from './api-integrations';
import { generateGeneReportTemplate } from './report-templates';
import { createSearchProvider } from '@/utils/deep-research/search';
import { 
  GeneResearchWorkflow, 
  GeneSearchTask, 
  GeneDataExtractionResult,
  GeneResearchQualityMetrics 
} from '@/types/gene-research';

export interface GeneResearchConfig {
  geneSymbol: string;
  organism: string;
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
  };
  language?: string;
  signal?: AbortSignal;
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
  };
}

export class GeneResearchEngine {
  private config: GeneResearchConfig;
  private queryGenerator: GeneQueryGenerator;
  private dataExtractor: GeneDataExtractor;
  private visualizationGenerator: GeneVisualizationGenerator;
  private qualityControl: GeneResearchQualityControl;
  private apiIntegrations: GeneAPIIntegrations;

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
    return searchable.includes(geneSymbol);
  }

  async conductResearch(): Promise<GeneResearchResult> {
    const startTime = Date.now();
    
    try {
      this.assertNotCancelled();
      // Phase 1: Generate research queries
      console.log('Phase 1: Generating research queries...');
      const queries = this.generateResearchQueries();
      this.assertNotCancelled();
      
      // Phase 2: Execute searches
      console.log('Phase 2: Executing searches...');
      const searchResults = await this.executeSearches(queries);
      this.assertNotCancelled();
      
      // Phase 3: Extract and process data
      console.log('Phase 3: Extracting and processing data...');
      const extractedData = await this.extractAndProcessData(searchResults);
      this.assertNotCancelled();
      
      // Phase 4: API integration (if enabled)
      let apiData = null;
      if (this.config.enableAPIIntegration) {
        console.log('Phase 4: Integrating API data...');
        apiData = await this.integrateAPIData();
        this.assertNotCancelled();
        if (apiData) {
          this.mergeAPIData(extractedData, apiData);
        }
      }
      
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
      const report = this.generateReport(extractedData, visualizations, qualityMetrics);
      this.assertNotCancelled();
      
      // Phase 8: Compile workflow
      const workflow = this.compileWorkflow(extractedData);
      
      const researchTime = Date.now() - startTime;
      
      return {
        workflow,
        qualityMetrics,
        visualizations,
        report,
        sources: Array.from(searchResults.values()).flatMap((result: any) => result?.sources || []),
        metadata: {
          researchTime,
          dataSources: this.getDataSources(searchResults, apiData),
          confidence: qualityMetrics.overallQuality,
          completeness: qualityMetrics.dataCompleteness
        }
      };
    } catch (error) {
      console.error('Gene research error:', error);
      throw new Error(`Gene research failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private generateResearchQueries(): GeneSearchTask[] {
    if (this.config.specificAspects && this.config.specificAspects.length > 0) {
      return this.queryGenerator.generateFocusedQueries(this.config.specificAspects);
    }
    return this.queryGenerator.generateComprehensiveQueries();
  }

  private async executeSearches(queries: GeneSearchTask[]): Promise<Map<string, any>> {
    const searchResults = new Map<string, any>();
    const searchProviders = this.config.searchProviders || ['pubmed', 'uniprot', 'ncbi_gene', 'geo', 'pdb', 'kegg', 'string', 'omim', 'ensembl', 'reactome'];

    for (const query of queries) {
      this.assertNotCancelled();
      try {
        const provider = query.database || 'pubmed';
        let result: any = null;
        if (searchProviders.includes(provider)) {
          try {
            result = await createGeneSearchProvider({
              provider,
              query: query.query,
              geneSymbol: this.config.geneSymbol,
              organism: this.config.organism,
              maxResult: this.config.maxSearchResults || 10,
              signal: this.config.signal,
            });
          } catch (error) {
            console.error(`Primary ${provider} search failed for query "${query.query}":`, error);
          }
        }

        // The MCP-configured provider (for example a local SearxNG instance)
        // supplies web/literature evidence when a curated database returns no
        // records. This keeps specialist APIs preferred while ensuring the
        // global DGR search configuration is actually honoured.
        const fallback = this.config.fallbackSearchProvider;
        if (!result?.sources?.length && fallback && fallback.provider !== 'model') {
          const fallbackResult = await createSearchProvider({
            provider: fallback.provider,
            baseURL: fallback.baseURL,
            apiKey: fallback.apiKey,
            query: query.query,
            maxResult: fallback.maxResult || this.config.maxSearchResults || 10,
          });
          result = {
            sources: fallbackResult.sources.filter(source => this.sourceMatchesGene(source)).map(source => ({
              title: source.title || query.query,
              content: source.content || '',
              url: source.url,
              database: fallback.provider,
              geneSymbol: this.config.geneSymbol,
              organism: this.config.organism,
              confidence: 0.6,
              evidence: ['search-result'],
              type: 'literature',
            })),
            images: fallbackResult.images || [],
            metadata: {
              totalResults: fallbackResult.sources.length,
              database: fallback.provider,
              searchTime: Date.now(),
              geneSymbol: this.config.geneSymbol,
              organism: this.config.organism,
            },
          };
        }

        if (result) {
          searchResults.set(query.query, result);
          this.assertNotCancelled();
        }
      } catch (error) {
        console.error(`Search error for query "${query.query}":`, error);
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

    // Process each search result
    for (const [, result] of searchResults) {
      this.assertNotCancelled();
      if (result.sources && result.sources.length > 0) {
        for (const source of result.sources) {
          this.assertNotCancelled();
          const content = `${source.title}\n${source.content}`;
          const partialData = await this.dataExtractor.extractFromContent(content, source.database || 'unknown');
          this.assertNotCancelled();
          
          // Merge extracted data
          this.mergeExtractedData(extractedData, partialData);
        }
      }
    }

    return extractedData as GeneDataExtractionResult;
  }

  private mergeExtractedData(target: Partial<GeneDataExtractionResult>, source: Partial<GeneDataExtractionResult>): void {
    const mergeNonEmpty = (destination: Record<string, any>, incoming: Record<string, any>) => {
      for (const [key, value] of Object.entries(incoming || {})) {
        if (value === undefined || value === null || value === '') continue;
        if (Array.isArray(value) && value.length === 0) continue;
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

  private generateReport(extractedData: GeneDataExtractionResult, visualizations: any[], qualityMetrics: GeneResearchQualityMetrics): any {
    try {
      const reportTemplate = generateGeneReportTemplate(
        this.config.geneSymbol,
        this.config.organism,
        this.config.reportType || 'comprehensive',
        this.config.targetAudience || 'researchers'
      );

      // Add extracted data to report
      reportTemplate.sections.forEach(section => {
        section.content = this.populateReportSection(section, extractedData, qualityMetrics);
      });

      // Add visualizations to report
      reportTemplate.sections.forEach(section => {
        if (section.visualizations) {
          section.visualizations.push(...visualizations.filter(viz => 
            viz.metadata?.geneSymbol === this.config.geneSymbol
          ));
        }
      });

      return reportTemplate;
    } catch (error) {
      console.error('Report generation error:', error);
      return { error: 'Report generation failed' };
    }
  }

  private populateReportSection(section: any, extractedData: GeneDataExtractionResult, qualityMetrics: GeneResearchQualityMetrics): string {
    let content = section.content;

    // Replace placeholders with actual data
    content = content.replace(/\[specific function\]/g, extractedData.functionalData.catalyticActivity || 'Unknown');
    content = content.replace(/\[specific function\]/g, extractedData.functionalData.molecularFunction?.[0] || 'Unknown');
    content = content.replace(/\[specific function\]/g, extractedData.functionalData.biologicalProcess?.[0] || 'Unknown');

    // Add quality metrics
    content += `\n\n### Data Quality Metrics\n`;
    content += `- **Overall Quality**: ${(qualityMetrics.overallQuality * 100).toFixed(1)}%\n`;
    content += `- **Data Completeness**: ${(qualityMetrics.dataCompleteness * 100).toFixed(1)}%\n`;
    content += `- **Literature Coverage**: ${(qualityMetrics.literatureCoverage * 100).toFixed(1)}%\n`;
    content += `- **Experimental Evidence**: ${(qualityMetrics.experimentalEvidence * 100).toFixed(1)}%\n`;

    return content;
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
