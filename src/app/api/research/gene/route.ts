/**
 * Simple Gene Research Endpoint
 * Provides synchronous research results for AI assistant easy calling
 * 
 * POST /api/research/gene
 * {
 *   "geneSymbol": "lysC",
 *   "organism": "Escherichia coli",
 *   "language": "Chinese",
 *   "maxResult": 5
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import DeepResearch from '@/utils/deep-research';
import { getAIProviderBaseURL, getAIProviderApiKey, getSearchProviderBaseURL, getSearchProviderApiKey } from '../../utils';
import { getResearchCache } from '@/utils/research-cache';
import * as fs from 'fs';
import * as path from 'path';

const AI_PROVIDER = process.env.MCP_AI_PROVIDER || '';
const SEARCH_PROVIDER = process.env.MCP_SEARCH_PROVIDER || 'model';
const THINKING_MODEL = process.env.MCP_THINKING_MODEL || '';
const TASK_MODEL = process.env.MCP_TASK_MODEL || '';

interface GeneResearchRequest {
  geneSymbol: string;
  organism: string;
  language?: string;
  maxResult?: number;
  enableCitationImage?: boolean;
  enableReferences?: boolean;
  useCache?: boolean;  // Default: true - use cached results if fresh
  forceRefresh?: boolean;  // Force refresh even if cached
}

interface ResearchResult {
  success: boolean;
  geneSymbol: string;
  organism: string;
  researchTime: number;
  source: 'cache' | 'fresh' | 'stale_cache';
  data?: {
    title?: string;
    sections?: any[];
    workflow?: any;
    qualityMetrics?: any;
  };
  message?: string;
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

async function runDeepResearch(
  geneSymbol: string,
  organism: string,
  language: string,
  maxResult: number,
  enableCitationImage: boolean,
  enableReferences: boolean
): Promise<any> {
  return new Promise((resolve, reject) => {
    const deepResearch = new DeepResearch({
      AIProvider: {
        baseURL: getAIProviderBaseURL(AI_PROVIDER),
        apiKey: getAIProviderApiKey(AI_PROVIDER),
        provider: AI_PROVIDER,
        thinkingModel: THINKING_MODEL,
        taskModel: TASK_MODEL,
      },
      searchProvider: {
        baseURL: getSearchProviderBaseURL(SEARCH_PROVIDER),
        apiKey: getSearchProviderApiKey(SEARCH_PROVIDER),
        provider: SEARCH_PROVIDER,
        maxResult,
      },
      language,
      onMessage: (event, data) => {
        if (event === 'error') {
          console.error('[DeepResearch] Error:', data.message);
        } else if (event === 'progress') {
          console.log(`[DeepResearch] ${data.step || 'progress'}: ${data.status || ''}`);
        }
      },
    });

    // Build research query
    const query = `${geneSymbol} gene in ${organism}`;
    console.log(`[DeepResearch] Starting research for: ${query}`);

    deepResearch.start(query, enableCitationImage, enableReferences)
      .then(resolve)
      .catch(reject);
  });
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body: GeneResearchRequest = await req.json();

    // Validate required fields
    if (!body.geneSymbol || body.geneSymbol.trim() === '') {
      return NextResponse.json(
        { error: 'geneSymbol is required' },
        { status: 400 }
      );
    }

    if (!body.organism || body.organism.trim() === '') {
      return NextResponse.json(
        { error: 'organism is required' },
        { status: 400 }
      );
    }

    const {
      geneSymbol,
      organism,
      language = 'English',
      maxResult = 5,
      enableCitationImage = true,
      enableReferences = true,
      useCache = true,
      forceRefresh = false
    } = body;

    console.log(`[GeneResearch] Request: ${geneSymbol} in ${organism} (lang=${language})`);

    // Check cache first
    const cache = getResearchCache();
    const cachedResult = useCache && !forceRefresh ? cache.get(geneSymbol, organism, 24) : null;

    if (cachedResult) {
      console.log(`[GeneResearch] Returning cached result for ${geneSymbol}`);
      const researchTime = Date.now() - startTime;
      
      return NextResponse.json({
        success: true,
        geneSymbol,
        organism,
        researchTime,
        source: 'cache',
        data: cachedResult.data,
        message: 'Returned from cache (24h)'
      } as ResearchResult);
    }

    // Run fresh research
    console.log(`[GeneResearch] Running fresh research...`);
    
    try {
      const result = await runDeepResearch(
        geneSymbol,
        organism,
        language,
        maxResult,
        enableCitationImage,
        enableReferences
      );

      // Cache the result
      const confidence = result.qualityMetrics?.overallQuality || 0.75;
      cache.set(geneSymbol, organism, {
        title: result.title,
        sections: result.report?.sections || [],
        workflow: result.workflow,
        qualityMetrics: result.qualityMetrics
      }, confidence);

      // Save to file
      const filePath = saveResearchResult(geneSymbol, organism, result);
      console.log(`[GeneResearch] Saved to: ${filePath}`);

      const researchTime = Date.now() - startTime;

      return NextResponse.json({
        success: true,
        geneSymbol,
        organism,
        researchTime,
        source: 'fresh',
        data: {
          title: result.title,
          sections: result.report?.sections || [],
          workflow: result.workflow,
          qualityMetrics: result.qualityMetrics
        },
        message: 'Research completed successfully'
      } as ResearchResult);

    } catch (researchError) {
      console.error(`[GeneResearch] Research failed:`, researchError);
      
      // Return error with partial data if available
      const partialResult = cache.get(geneSymbol, organism, 168); // 7 days fallback
      if (partialResult) {
        console.log(`[GeneResearch] Returning stale cache as fallback`);
        return NextResponse.json({
          success: false,
          geneSymbol,
          organism,
          researchTime: Date.now() - startTime,
          source: 'stale_cache',
          data: partialResult.data,
          message: `Research failed: ${researchError instanceof Error ? researchError.message : 'Unknown error'}. Returned stale cache.`
        } as ResearchResult);
      }

      throw researchError;
    }

  } catch (error) {
    console.error('[GeneResearch] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Research failed',
        researchTime: Date.now() - startTime
      },
      { status: 500 }
    );
  }
}

// GET endpoint to check cache status
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const geneSymbol = searchParams.get('gene');
  const organism = searchParams.get('organism');

  if (!geneSymbol || !organism) {
    // List all cached genes
    const cache = getResearchCache();
    const entries = cache.list();
    return NextResponse.json({
      cachedGenes: entries.map(e => ({
        geneSymbol: e.geneSymbol,
        organism: e.organism,
        updatedAt: e.updatedAt,
        confidence: e.confidence
      })),
      total: entries.length
    });
  }

  // Check specific gene
  const cache = getResearchCache();
  const entry = cache.get(geneSymbol, organism, 24 * 7); // 7 days for GET

  if (entry) {
    return NextResponse.json({
      cached: true,
      geneSymbol: entry.geneSymbol,
      organism: entry.organism,
      updatedAt: entry.updatedAt,
      confidence: entry.confidence,
      ageHours: Math.round((Date.now() - new Date(entry.updatedAt).getTime()) / 3600000)
    });
  }

  return NextResponse.json({
    cached: false,
    geneSymbol,
    organism
  });
}

// DELETE endpoint to clear cache
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const geneSymbol = searchParams.get('gene');
  const organism = searchParams.get('organism');

  const cache = getResearchCache();

  if (geneSymbol && organism) {
    cache.invalidate(geneSymbol, organism);
    return NextResponse.json({ success: true, message: `Cleared cache for ${geneSymbol}/${organism}` });
  }

  cache.clear();
  return NextResponse.json({ success: true, message: 'Cleared all research cache' });
}
