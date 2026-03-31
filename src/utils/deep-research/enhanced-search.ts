/**
 * Enhanced Search with Fallback Mechanism
 * - Primary: External search APIs (when available)
 * - Fallback: AI model knowledge synthesis
 */

import {
  TAVILY_BASE_URL,
  BOCHA_BASE_URL,
} from "@/constants/urls";
import { pick, sort } from "radash";

export interface Source {
  title: string;
  content: string;
  url: string;
}

export interface ImageSource {
  url: string;
  description?: string;
}

export interface SearchResult {
  sources: Source[];
  images: ImageSource[];
  searchMethod: 'api' | 'model_fallback';
  query: string;
  timestamp: string;
}

// Timeout for search requests (in ms)
const SEARCH_TIMEOUT = 10000;

// SearXNG instances to try (in order of preference)
const SEARXNG_INSTANCES = [
  'https://searx.be',
  'https://searx.privacytech.eu',
  'https://search.us.to',
  'https://search.bus-hit.me',
];

async function fetchWithTimeout(url: string, options: RequestInit, timeout = SEARCH_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function trySearxngInstance(baseURL: string, query: string, maxResult: number): Promise<SearchResult | null> {
  try {
    const params = new URLSearchParams({
      q: query,
      categories: 'science',
      engines: 'pubmed,google_scholar',
      lang: 'en',
      format: 'json',
    });

    const response = await fetchWithTimeout(
      `${baseURL}/search?${params.toString()}`,
      { method: 'GET', credentials: 'omit' },
      SEARCH_TIMEOUT
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];

    if (results.length === 0) {
      return null;
    }

    const sortedResults = sort(results, (item: any) => item.score || 0, true);

    return {
      sources: sortedResults
        .filter((item: any) => item.content && item.url)
        .slice(0, maxResult)
        .map((result: any) => pick(result, ['title', 'content', 'url'])),
      images: [],
      searchMethod: 'api',
      query,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.log(`[Search] SearXNG instance ${baseURL} failed: ${error}`);
    return null;
  }
}

async function tryTavily(query: string, apiKey: string, maxResult: number): Promise<SearchResult | null> {
  try {
    const response = await fetchWithTimeout(
      `${TAVILY_BASE_URL}/search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        credentials: 'omit',
        body: JSON.stringify({
          query,
          search_depth: 'basic',
          max_results: maxResult,
          include_answer: true,
        }),
      },
      SEARCH_TIMEOUT
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];

    return {
      sources: results.map((r: any) => ({
        title: r.title,
        content: r.content || r.rawContent,
        url: r.url,
      })),
      images: [],
      searchMethod: 'api',
      query,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.log(`[Search] Tavily failed: ${error}`);
    return null;
  }
}

async function tryBocha(query: string, apiKey: string, maxResult: number): Promise<SearchResult | null> {
  try {
    const response = await fetchWithTimeout(
      `${BOCHA_BASE_URL}/v1/web-search`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        credentials: 'omit',
        body: JSON.stringify({
          query,
          count: maxResult,
          summary: true,
        }),
      },
      SEARCH_TIMEOUT
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const results = data.data?.webPages?.value || [];

    return {
      sources: results.map((r: any) => ({
        title: r.name,
        content: r.summary || r.snippet,
        url: r.url,
      })),
      images: [],
      searchMethod: 'api',
      query,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.log(`[Search] Bocha failed: ${error}`);
    return null;
  }
}

/**
 * Main search function with fallback chain:
 * 1. Try SearXNG instances (public, no API key)
 * 2. Try Tavily (requires API key)
 * 3. Try Bocha (requires API key)
 * 4. Fall back to model-based synthesis
 */
export async function enhancedSearch(
  query: string,
  maxResult: number = 5,
  options: {
    tavilyApiKey?: string;
    bochaApiKey?: string;
    useModelFallback?: boolean;
  } = {}
): Promise<SearchResult> {
  const { tavilyApiKey, bochaApiKey, useModelFallback = true } = options;

  console.log(`[Search] Starting search for: "${query}"`);

  // Try SearXNG instances (public, no API key needed)
  for (const instance of SEARXNG_INSTANCES) {
    console.log(`[Search] Trying SearXNG instance: ${instance}`);
    const result = await trySearxngInstance(instance, query, maxResult);
    if (result && result.sources.length > 0) {
      console.log(`[Search] Success! Got ${result.sources.length} results from ${instance}`);
      return result;
    }
  }

  // Try Tavily if API key is available
  if (tavilyApiKey) {
    console.log(`[Search] Trying Tavily...`);
    const result = await tryTavily(query, tavilyApiKey, maxResult);
    if (result && result.sources.length > 0) {
      console.log(`[Search] Tavily success!`);
      return result;
    }
  }

  // Try Bocha if API key is available
  if (bochaApiKey) {
    console.log(`[Search] Trying Bocha...`);
    const result = await tryBocha(query, bochaApiKey, maxResult);
    if (result && result.sources.length > 0) {
      console.log(`[Search] Bocha success!`);
      return result;
    }
  }

  // All external search failed, use model fallback or return empty
  if (useModelFallback) {
    console.log(`[Search] All external search failed, using model-based synthesis`);
    return {
      sources: [],
      images: [],
      searchMethod: 'model_fallback',
      query,
      timestamp: new Date().toISOString(),
    };
  }

  // Return empty results
  console.log(`[Search] No results found`);
  return {
    sources: [],
    images: [],
    searchMethod: 'api',
    query,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Model-based knowledge synthesis when search fails
 * Uses the AI model to generate relevant information based on training data
 */
export async function synthesizeKnowledgeWithModel(
  query: string,
  aiProvider: {
    baseURL: string;
    apiKey: string;
    model: string;
  }
): Promise<string> {
  const synthesisPrompt = `You are a helpful biology research assistant. The user is asking about: "${query}"

Based on your knowledge, please provide accurate, factual information about this topic. Focus on:
1. Key biological functions
2. Molecular mechanisms
3. Relevant pathways
4. Known research findings
5. Important databases and resources

If you don't have specific information, say so honestly rather than making up details.

Please provide a comprehensive but concise response in English.`;

  try {
    const response = await fetchWithTimeout(
      `${aiProvider.baseURL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiProvider.apiKey}`,
        },
        credentials: 'omit',
        body: JSON.stringify({
          model: aiProvider.model,
          messages: [
            { role: 'user', content: synthesisPrompt }
          ],
          max_tokens: 2000,
          temperature: 0.7,
        }),
      },
      30000
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error(`[Model Synthesis] Failed: ${error}`);
    return '';
  }
}
