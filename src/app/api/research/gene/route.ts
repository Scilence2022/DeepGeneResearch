/**
 * Enhanced Gene Research Route
 * Uses enhanced search with fallback and model synthesis
 * Now includes direct literature database search (PubMed, Europe PMC, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { enhancedSearch, synthesizeKnowledgeWithModel, Source } from '@/utils/deep-research/enhanced-search';
import { 
  searchPubMed, 
  searchEuropePMC, 
  searchNCBIGene, 
  searchUniProt,
  searchBiorxiv
} from '@/utils/gene-research/search-providers';
import { getAIProviderBaseURL, getAIProviderApiKey } from '../../utils';
import { getResearchCache } from '@/utils/research-cache';
import * as fs from 'fs';
import * as path from 'path';

const AI_PROVIDER = process.env.MCP_AI_PROVIDER || '';
const TASK_MODEL = process.env.MCP_TASK_MODEL || '';

interface GeneResearchRequest {
  geneSymbol: string;
  organism: string;
  language?: string;
  maxResult?: number;
  enableCitationImage?: boolean;
  enableReferences?: boolean;
  useCache?: boolean;
  forceRefresh?: boolean;
  researchFocus?: string[];
  specificAspects?: string[];
}

const RESEARCH_DIR = path.join(process.cwd(), 'gene-research-results');

function ensureResearchDir() {
  if (!fs.existsSync(RESEARCH_DIR)) {
    fs.mkdirSync(RESEARCH_DIR, { recursive: true });
  }
}

function saveResearchResult(geneSymbol: string, organism: string, result: any) {
  ensureResearchDir();
  const fileName = `${geneSymbol}_${organism.replace(/\s+/g, '_')}_${Date.now()}.json`;
  const filePath = path.join(RESEARCH_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
  return filePath;
}

/**
 * Generate research content using AI model when search fails
 */
async function generateResearchWithModel(
  geneSymbol: string,
  organism: string,
  researchFocus: string[],
  specificAspects: string[],
  language: string
): Promise<{ content: string; sources: any[] }> {
  const aspectsStr = specificAspects.length > 0 ? specificAspects.join(', ') : 'comprehensive overview';

  const aiConfig = {
    baseURL: getAIProviderBaseURL(AI_PROVIDER),
    apiKey: getAIProviderApiKey(AI_PROVIDER),
    model: TASK_MODEL || 'MiniMax-M2.7',
  };

  const content = await synthesizeKnowledgeWithModel(
    `${geneSymbol} gene ${organism} research: ${aspectsStr}`,
    aiConfig
  );

  return {
    content: content || generateFallbackReport(geneSymbol, organism, researchFocus, specificAspects, language),
    sources: [{
      title: 'AI Model Knowledge Synthesis',
      content: 'Information synthesized from training data',
      url: 'internal:model_synthesis'
    }]
  };
}

/**
 * Generate a basic report when both search and model synthesis fail
 */
function generateFallbackReport(
  geneSymbol: string,
  organism: string,
  researchFocus: string[],
  specificAspects: string[],
  language: string
): string {
  const focusStr = researchFocus.length > 0 ? researchFocus.join(', ') : 'general';

  if (language === 'Chinese') {
    return `# ${geneSymbol} 基因研究报告
## ${organism}

**注意**: 当前无法从外部数据库获取最新数据，以下信息基于已有的基因功能注释。

### 基因概述
- **基因名称**: ${geneSymbol}
- **物种**: ${organism}
- **研究重点**: ${focusStr}

### 关键研究领域
${specificAspects.map((a, i) => `${i + 1}. ${a}`).join('\n')}

### 建议
1. 请配置有效的搜索API以获取最新研究数据
2. 建议使用PubMed、UniProt等数据库进行文献检索
3. 可访问KEGG、BioCyc等数据库获取代谢途径信息

---
*报告生成时间: ${new Date().toISOString()}*`;
  } else {
    return `# ${geneSymbol} Gene Research Report
## ${organism}

**Note**: External database access is currently unavailable. This information is based on existing gene annotations.

### Gene Overview
- **Gene Name**: ${geneSymbol}
- **Organism**: ${organism}
- **Research Focus**: ${focusStr}

### Key Research Areas
${specificAspects.map((a, i) => `${i + 1}. ${a}`).join('\n')}

### Recommendations
1. Configure a valid search API to obtain latest research data
2. Use PubMed, UniProt for literature search
3. Visit KEGG, BioCyc for metabolic pathway information

---
*Report generated: ${new Date().toISOString()}*`;
  }
}

/**
 * Search literature databases for gene-related publications
 * Uses PubMed, Europe PMC, NCBI Gene, UniProt, and bioRxiv
 */
async function searchLiteratureDatabases(
  geneSymbol: string,
  organism: string,
  maxResult: number
): Promise<Source[]> {
  const sources: Source[] = [];
  
  try {
    // Determine organism filter
    const organismFilter = organism.toLowerCase().includes('e. coli') || organism.toLowerCase().includes('escherichia') 
      ? 'Escherichia coli' 
      : organism;

    // Search PubMed
    try {
      const pubmedResult = await searchPubMed({
        provider: 'pubmed',
        query: geneSymbol,
        geneSymbol: geneSymbol,
        organism: organismFilter,
        maxResult: Math.ceil(maxResult * 1.5)
      });
      
      for (const source of pubmedResult.sources) {
        sources.push({
          title: source.title || 'Untitled',
          content: (source.abstract || source.content || '').slice(0, 500),
          url: source.url || '#'
        });
      }
      console.log(`[GeneResearch] PubMed: ${pubmedResult.sources.length} results`);
    } catch (e) {
      console.warn('[GeneResearch] PubMed search failed:', e);
    }

    // Search Europe PMC
    try {
      const eurpmcResult = await searchEuropePMC({
        provider: 'europe_pmc',
        query: geneSymbol,
        geneSymbol: geneSymbol,
        organism: organismFilter,
        maxResult: Math.ceil(maxResult * 1.5)
      });
      
      for (const source of eurpmcResult.sources) {
        // Avoid duplicates
        if (!sources.some(s => s.url === source.url)) {
          sources.push({
            title: source.title || 'Untitled',
            content: (source.abstract || source.content || '').slice(0, 500),
            url: source.url || '#'
          });
        }
      }
      console.log(`[GeneResearch] Europe PMC: ${eurpmcResult.sources.length} results`);
    } catch (e) {
      console.warn('[GeneResearch] Europe PMC search failed:', e);
    }

    // Search NCBI Gene
    try {
      const ncbiResult = await searchNCBIGene({
        provider: 'ncbi_gene',
        query: geneSymbol,
        geneSymbol: geneSymbol,
        organism: organismFilter,
        maxResult: 5
      });
      
      for (const source of ncbiResult.sources) {
        sources.push({
          title: source.title || 'Untitled',
          content: (source.content || '').slice(0, 500),
          url: source.url || '#'
        });
      }
      console.log(`[GeneResearch] NCBI Gene: ${ncbiResult.sources.length} results`);
    } catch (e) {
      console.warn('[GeneResearch] NCBI Gene search failed:', e);
    }

    // Search UniProt
    try {
      const uniprotResult = await searchUniProt({
        provider: 'uniprot',
        query: geneSymbol,
        geneSymbol: geneSymbol,
        organism: organismFilter,
        maxResult: 5
      });
      
      for (const source of uniprotResult.sources) {
        if (!sources.some(s => s.url === source.url)) {
          sources.push({
            title: source.title || 'Untitled',
            content: (source.content || '').slice(0, 500),
            url: source.url || '#'
          });
        }
      }
      console.log(`[GeneResearch] UniProt: ${uniprotResult.sources.length} results`);
    } catch (e) {
      console.warn('[GeneResearch] UniProt search failed:', e);
    }

    // Search bioRxiv preprints
    try {
      const biorxivResult = await searchBiorxiv({
        provider: 'biorxiv',
        query: geneSymbol,
        geneSymbol: geneSymbol,
        organism: organismFilter,
        maxResult: 3
      });
      
      for (const source of biorxivResult.sources) {
        if (!sources.some(s => s.url === source.url)) {
          sources.push({
            title: `[PREPRINT] ${source.title || 'Untitled'}`,
            content: ((source.abstract || source.content || '') + '\n\n⚠️ 注意：预印本尚未经过同行评审').slice(0, 500),
            url: source.url || '#'
          });
        }
      }
      console.log(`[GeneResearch] bioRxiv: ${biorxivResult.sources.length} results`);
    } catch (e) {
      console.warn('[GeneResearch] bioRxiv search failed:', e);
    }

  } catch (error) {
    console.error('[GeneResearch] Literature search error:', error);
  }

  return sources as Source[];
}

/**
 * Generate report from literature search results
 */
function generateLiteratureReport(
  geneSymbol: string,
  organism: string,
  sources: Source[],
  language: string
): string {
  if (sources.length === 0) {
    return generateFallbackReport(geneSymbol, organism, [], [], language);
  }

  const isChinese = language === 'Chinese';
  
  // Group sources by type
  const pubmedSources = sources.filter(s => s.url.includes('pubmed'));
  const eurpmcSources = sources.filter(s => s.url.includes('europepmc') || s.url.includes('pmc'));
  const uniprotSources = sources.filter(s => s.url.includes('uniprot'));
  const ncbiSources = sources.filter(s => s.url.includes('ncbi.nlm.nih.gov/gene'));
  const biorxivSources = sources.filter(s => s.url.includes('biorxiv') || s.url.includes('doi.org'));

  let header = isChinese
    ? `# ${geneSymbol} 基因功能研究报告\n## ${organism}\n\n**数据来源**: 文献数据库检索\n\n---\n`
    : `# ${geneSymbol} Gene Function Research Report\n## ${organism}\n\n**Data Source**: Literature Database Search\n\n---\n`;

  // Literature statistics
  header += isChinese
    ? `### 📊 文献检索统计\n\n- PubMed: ${pubmedSources.length} 篇\n- Europe PMC: ${eurpmcSources.length} 篇\n- NCBI Gene: ${ncbiSources.length} 条\n- UniProt: ${uniprotSources.length} 条\n- bioRxiv: ${biorxivSources.length} 篇\n\n---\n\n`
    : `### 📊 Literature Search Statistics\n\n- PubMed: ${pubmedSources.length} articles\n- Europe PMC: ${eurpmcSources.length} articles\n- NCBI Gene: ${ncbiSources.length} entries\n- UniProt: ${uniprotSources.length} entries\n- bioRxiv: ${biorxivSources.length} preprints\n\n---\n\n`;

  // Literature sections
  if (pubmedSources.length > 0) {
    header += isChinese ? `## 📚 PubMed 文献\n\n` : `## 📚 PubMed Literature\n\n`;
    pubmedSources.slice(0, 5).forEach((s, i) => {
      header += `${i + 1}. [${s.title}](${s.url})\n`;
      if (s.content) {
        header += `   ${s.content.slice(0, 200)}...\n`;
      }
      header += '\n';
    });
    header += '\n';
  }

  if (eurpmcSources.length > 0) {
    header += isChinese ? `## 📄 Europe PMC 全文\n\n` : `## 📄 Europe PMC Full-text\n\n`;
    eurpmcSources.slice(0, 3).forEach((s, i) => {
      header += `${i + 1}. [${s.title}](${s.url})\n`;
      if (s.content) {
        header += `   ${s.content.slice(0, 200)}...\n`;
      }
      header += '\n';
    });
    header += '\n';
  }

  if (ncbiSources.length > 0) {
    header += isChinese ? `## 🧬 NCBI Gene 条目\n\n` : `## 🧬 NCBI Gene Entry\n\n`;
    ncbiSources.slice(0, 3).forEach((s, i) => {
      header += `${i + 1}. [${s.title}](${s.url})\n`;
      if (s.content) {
        header += `   ${s.content.slice(0, 300)}...\n`;
      }
      header += '\n';
    });
    header += '\n';
  }

  if (uniprotSources.length > 0) {
    header += isChinese ? `## 🔬 UniProt 蛋白质数据\n\n` : `## 🔬 UniProt Protein Data\n\n`;
    uniprotSources.slice(0, 3).forEach((s, i) => {
      header += `${i + 1}. [${s.title}](${s.url})\n`;
      if (s.content) {
        header += `   ${s.content.slice(0, 300)}...\n`;
      }
      header += '\n';
    });
    header += '\n';
  }

  if (biorxivSources.length > 0) {
    header += isChinese 
      ? `## ⚠️ bioRxiv 预印本 (未经同行评审)\n\n` 
      : `## ⚠️ bioRxiv Preprints (Not Peer-Reviewed)\n\n`;
    biorxivSources.slice(0, 3).forEach((s, i) => {
      header += `${i + 1}. [${s.title}](${s.url})\n\n`;
    });
    header += '\n';
  }

  const footer = isChinese
    ? `\n---\n*报告生成时间: ${new Date().toISOString()}*\n*数据来源: NCBI PubMed, Europe PMC, NCBI Gene, UniProt, bioRxiv*`
    : `\n---\n*Report generated: ${new Date().toISOString()}*\n*Data sources: NCBI PubMed, Europe PMC, NCBI Gene, UniProt, bioRxiv*`;

  return header + footer;
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const body: GeneResearchRequest = await req.json();

    // Validate required fields
    if (!body.geneSymbol || body.geneSymbol.trim() === '') {
      return NextResponse.json({ error: 'geneSymbol is required' }, { status: 400 });
    }
    if (!body.organism || body.organism.trim() === '') {
      return NextResponse.json({ error: 'organism is required' }, { status: 400 });
    }

    const {
      geneSymbol,
      organism,
      language = 'English',
      maxResult = 5,
      useCache = true,
      forceRefresh = false,
      researchFocus = [],
      specificAspects = []
    } = body;

    console.log(`[GeneResearch] Request: ${geneSymbol} in ${organism}`);

    const cache = getResearchCache();
    const cachedResult = useCache && !forceRefresh ? cache.get(geneSymbol, organism, 24) : null;

    if (cachedResult) {
      console.log(`[GeneResearch] Returning cached result for ${geneSymbol}`);
      return NextResponse.json({
        success: true,
        geneSymbol,
        organism,
        researchTime: Date.now() - startTime,
        source: 'cache',
        data: cachedResult.data,
        message: 'Returned from cache (24h)'
      });
    }

    // Build search query
    const searchQuery = `${geneSymbol} ${organism} gene function protein`;
    console.log(`[GeneResearch] Searching: ${searchQuery}`);

    // Try enhanced search with fallback
    const searchResult = await enhancedSearch(searchQuery, maxResult, {
      tavilyApiKey: process.env.TAVILY_API_KEY,
      bochaApiKey: process.env.BOCHA_API_KEY,
      useModelFallback: true
    });

    let reportContent = '';
    let sources = searchResult.sources;
    let searchMethod: string = searchResult.searchMethod;

    // Check if web search only returned model synthesis (fallback)
    const onlyModelSynthesis = searchResult.sources.length === 1 && 
      searchResult.sources[0]?.url === 'internal:model_synthesis';

    // If no real search results (or only model synthesis), try literature databases
    if (searchResult.sources.length === 0 || onlyModelSynthesis) {
      console.log(`[GeneResearch] Web search insufficient, trying literature databases...`);
      
      // Search literature databases
      const literatureSources = await searchLiteratureDatabases(geneSymbol, organism, maxResult);
      
      if (literatureSources.length > 0) {
        console.log(`[GeneResearch] Found ${literatureSources.length} results from literature databases`);
        sources = literatureSources;
        searchMethod = 'literature_database';
        reportContent = generateLiteratureReport(geneSymbol, organism, literatureSources, language);
      } else if (onlyModelSynthesis) {
        // Only use model synthesis if literature search also fails
        console.log(`[GeneResearch] No literature results, using model synthesis`);
        const modelResult = await generateResearchWithModel(
          geneSymbol,
          organism,
          researchFocus,
          specificAspects,
          language
        );
        reportContent = modelResult.content;
        sources = modelResult.sources;
        searchMethod = 'model_fallback';
      }
    } else {
      // Also try literature databases for more comprehensive results
      const literatureSources = await searchLiteratureDatabases(geneSymbol, organism, maxResult);
      if (literatureSources.length > 0) {
        console.log(`[GeneResearch] Adding ${literatureSources.length} literature results`);
        // Merge sources, avoiding duplicates by URL
        const existingUrls = new Set(sources.map(s => s.url));
        for (const ls of literatureSources) {
          if (!existingUrls.has(ls.url)) {
            sources.push(ls);
            existingUrls.add(ls.url);
          }
        }
        searchMethod = 'web_plus_literature';
      }
      // Generate report from search results
      reportContent = generateReportFromSources(geneSymbol, organism, sources, language);
    }

    // Create research result
    const result = {
      title: `${geneSymbol} Gene Function Research Report: ${organism}`,
      finalReport: reportContent,
      sources,
      searchMethod: searchMethod,
      qualityMetrics: {
        dataCompleteness: sources.length > 0 ? 0.8 : 0.3,
        literatureCoverage: sources.length > 0 ? 0.85 : 0.2,
        overallQuality: sources.length > 0 ? 0.8 : 0.3
      }
    };

    // Cache the result
    cache.set(geneSymbol, organism, result, result.qualityMetrics.overallQuality);

    // Save to file
    const filePath = saveResearchResult(geneSymbol, organism, result);
    console.log(`[GeneResearch] Saved to: ${filePath}`);

    return NextResponse.json({
      success: true,
      geneSymbol,
      organism,
      researchTime: Date.now() - startTime,
      source: 'fresh',
      searchMethod: searchMethod,
      data: result,
      message: 'Research completed successfully'
    });

  } catch (error) {
    console.error('[GeneResearch] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Research failed' },
      { status: 500 }
    );
  }
}

function generateReportFromSources(geneSymbol: string, organism: string, sources: any[], language: string): string {
  const header = language === 'Chinese'
    ? `# ${geneSymbol} 基因研究报告\n## ${organism}\n\n**数据来源**: 基于文献搜索结果\n\n---`
    : `# ${geneSymbol} Gene Research Report\n## ${organism}\n\n**Data Source**: Literature Search Results\n\n---`;

  const sourceList = sources.map((s, i) =>
    `${i + 1}. [${s.title}](${s.url})${s.content ? `\n   ${s.content.slice(0, 200)}...` : ''}`
  ).join('\n\n');

  const footer = language === 'Chinese'
    ? `\n---\n*报告生成时间: ${new Date().toISOString()}*\n*注意: 建议访问原始文献获取完整信息*`
    : `\n---\n*Report generated: ${new Date().toISOString()}*\n*Note: Visit original sources for complete information*`;

  return `${header}\n\n## 文献来源\n\n${sourceList}\n\n${footer}`;
}
