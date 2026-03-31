/**
 * DeepGeneResearch Cache - Incremental Learning Layer
 * Caches gene research results to avoid redundant searches
 */

import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.research-cache');

interface CacheEntry {
  geneSymbol: string;
  organism: string;
  data: any;
  createdAt: string;
  updatedAt: string;
  confidence: number;
  version: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface CacheMetadata {
  entries: Record<string, CacheEntry>;
  lastUpdated: string;
}

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheKey(geneSymbol: string, organism: string): string {
  return `${geneSymbol.toLowerCase()}_${organism.toLowerCase().replace(/\s+/g, '_')}`;
}

function getCacheFilePath(geneSymbol: string, organism: string): string {
  const key = getCacheKey(geneSymbol, organism);
  return path.join(CACHE_DIR, `${key}.json`);
}

export class ResearchCache {
  private cache: Map<string, CacheEntry> = new Map();
  private metadataPath: string;
  private version: string = '1.0.0';

  constructor() {
    ensureCacheDir();
    this.metadataPath = path.join(CACHE_DIR, 'metadata.json');
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.metadataPath)) {
        const data = JSON.parse(fs.readFileSync(this.metadataPath, 'utf-8'));
        this.version = data.version || '1.0.0';
        if (data.entries) {
          Object.entries(data.entries).forEach(([key, value]) => {
            this.cache.set(key, value as CacheEntry);
          });
        }
      }
    } catch (error) {
      console.error('Failed to load research cache:', error);
    }
  }

  private save() {
    try {
      const entries: Record<string, CacheEntry> = {};
      this.cache.forEach((value, key) => {
        entries[key] = value;
      });
      fs.writeFileSync(
        this.metadataPath,
        JSON.stringify({
          version: this.version,
          lastUpdated: new Date().toISOString(),
          entries
        }, null, 2)
      );
    } catch (error) {
      console.error('Failed to save research cache:', error);
    }
  }

  get(geneSymbol: string, organism: string, maxAgeHours: number = 24): CacheEntry | null {
    const key = getCacheKey(geneSymbol, organism);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if cache is stale
    const ageMs = Date.now() - new Date(entry.updatedAt).getTime();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;

    if (ageMs > maxAgeMs) {
      console.log(`[Cache] ${geneSymbol}/${organism} is ${maxAgeHours}h old, refreshing...`);
      return null;
    }

    console.log(`[Cache] HIT: ${geneSymbol}/${organism}`);
    return entry;
  }

  set(geneSymbol: string, organism: string, data: any, confidence: number = 0.8): void {
    const key = getCacheKey(geneSymbol, organism);
    const now = new Date().toISOString();

    const existing = this.cache.get(key);

    const entry: CacheEntry = {
      geneSymbol,
      organism,
      data,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      confidence,
      version: this.version
    };

    this.cache.set(key, entry);
    this.save();

    // Also save individual file for quick access
    const filePath = getCacheFilePath(geneSymbol, organism);
    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));

    console.log(`[Cache] Stored: ${geneSymbol}/${organism} (confidence: ${confidence})`);
  }

  has(geneSymbol: string, organism: string): boolean {
    return this.cache.has(getCacheKey(geneSymbol, organism));
  }

  invalidate(geneSymbol: string, organism: string): void {
    const key = getCacheKey(geneSymbol, organism);
    this.cache.delete(key);
    this.save();

    const filePath = getCacheFilePath(geneSymbol, organism);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  clear(): void {
    this.cache.clear();
    this.save();
  }

  list(): CacheEntry[] {
    return Array.from(this.cache.values());
  }

  // Quick check if we have cached data
  async getIfFresh(geneSymbol: string, organism: string): Promise<any | null> {
    const entry = this.get(geneSymbol, organism, 24); // 24 hour cache
    if (entry) {
      return entry.data;
    }
    return null;
  }
}

// Singleton instance
let cacheInstance: ResearchCache | null = null;

export function getResearchCache(): ResearchCache {
  if (!cacheInstance) {
    cacheInstance = new ResearchCache();
  }
  return cacheInstance;
}
