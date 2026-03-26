#!/usr/bin/env node
/**
 * DeepGeneResearch CLI Helper
 * Easy way for AI assistant to trigger gene research
 * 
 * Usage:
 *   node research-gene.js lysC "Escherichia coli" Chinese
 *   node research-gene.js --status
 *   node research-gene.js --list
 *   node research-gene.js --clear lysC "Escherichia coli"
 */

const http = require('http');

const SERVER_URL = 'http://localhost:3000';
const GENE_ENDPOINT = `${SERVER_URL}/api/research/gene`;

// Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(color, prefix, message) {
  console.log(`${color}[${prefix}]${colors.reset} ${message}`);
}

function success(message) { log(colors.green, 'SUCCESS', message); }
function info(message) { log(colors.blue, 'INFO', message); }
function warn(message) { log(colors.yellow, 'WARN', message); }
function error(message) { log(colors.red, 'ERROR', message); }

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

async function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runResearch(geneSymbol, organism, language = 'English', maxResult = 5) {
  info(`Starting research: ${geneSymbol} in ${organism} (language: ${language})`);
  
  const body = {
    geneSymbol,
    organism,
    language,
    maxResult,
    useCache: true,
    forceRefresh: false
  };

  const startTime = Date.now();
  
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/gene',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, body);

    const duration = Date.now() - startTime;

    if (result.success) {
      success(`Research completed in ${formatDuration(result.researchTime)} (source: ${result.source})`);
      console.log('\n--- Research Result ---');
      console.log(`Gene: ${result.geneSymbol}`);
      console.log(`Organism: ${result.organism}`);
      if (result.data?.title) {
        console.log(`Title: ${result.data.title}`);
      }
      if (result.data?.qualityMetrics) {
        const qm = result.data.qualityMetrics;
        console.log(`Quality: Overall=${(qm.overallQuality * 100).toFixed(0)}% | Completeness=${(qm.dataCompleteness * 100).toFixed(0)}%`);
      }
    } else {
      error(`Research failed: ${result.message || result.error}`);
      if (result.source === 'stale_cache') {
        warn('Using stale cache as fallback');
      }
    }
  } catch (err) {
    error(`Request failed: ${err.message}`);
    error('Make sure DeepGeneResearch server is running on port 3000');
  }
}

async function checkStatus() {
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/gene',
      method: 'GET'
    });

    if (result.cached !== undefined) {
      console.log('\n--- Cache Status ---');
      if (result.cached) {
        console.log(`Gene: ${result.geneSymbol}/${result.organism}`);
        console.log(`Cached: Yes (${result.ageHours}h old)`);
        console.log(`Confidence: ${(result.confidence * 100).toFixed(0)}%`);
        console.log(`Updated: ${result.updatedAt}`);
      } else {
        console.log(`Gene: ${result.geneSymbol}/${result.organism}`);
        console.log(`Cached: No`);
      }
    } else if (result.cachedGenes) {
      console.log('\n--- Cached Genes ---');
      console.log(`Total: ${result.total} genes`);
      result.cachedGenes.forEach(g => {
        console.log(`  - ${g.geneSymbol} (${g.organism}) - ${g.confidence * 100}% - ${g.updatedAt}`);
      });
    }
  } catch (err) {
    error(`Status check failed: ${err.message}`);
  }
}

async function listCached() {
  try {
    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/research/gene',
      method: 'GET'
    });

    console.log('\n--- Cached Research Results ---');
    console.log(`Total: ${result.total || 0} genes\n`);
    
    if (result.cachedGenes) {
      result.cachedGenes.forEach(g => {
        const age = Math.round((Date.now() - new Date(g.updatedAt).getTime()) / 3600000);
        console.log(`📁 ${colors.cyan}${g.geneSymbol}${colors.reset} (${g.organism})`);
        console.log(`   Updated: ${g.updatedAt} (${age}h ago)`);
        console.log(`   Confidence: ${(g.confidence * 100).toFixed(0)}%\n`);
      });
    }
  } catch (err) {
    error(`List failed: ${err.message}`);
  }
}

async function clearCache(geneSymbol, organism) {
  try {
    const path = geneSymbol && organism 
      ? `/api/research/gene?gene=${encodeURIComponent(geneSymbol)}&organism=${encodeURIComponent(organism)}`
      : `/api/research/gene`;

    const result = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path,
      method: 'DELETE'
    });

    if (result.success) {
      success(result.message);
    } else {
      error(result.message || 'Clear failed');
    }
  } catch (err) {
    error(`Clear failed: ${err.message}`);
  }
}

// Main CLI parser
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
${colors.cyan}DeepGeneResearch CLI Helper${colors.reset}

Usage:
  node research-gene.js <gene> <organism> [language] [maxResult]
  
Examples:
  node research-gene.js lysC "Escherichia coli" Chinese
  node research-gene.js BRCA1 "Homo sapiens" English 10
  
Commands:
  ${colors.yellow}--status [gene] [organism]${colors.reset}   Check cache status
  ${colors.yellow}--list${colors.reset}                        List all cached genes
  ${colors.yellow}--clear [gene] [organism]${colors.reset}    Clear cache
  ${colors.yellow}--help${colors.reset}                        Show this help

Quick Research:
  node research-gene.js <gene> <organism> [language]
  
Notes:
  - Default language is English
  - Default maxResult is 5
  - Server must be running on localhost:3000
  `);
  process.exit(0);
}

if (args[0] === '--status') {
  const gene = args[1];
  const organism = args[2];
  if (gene && organism) {
    checkStatus(gene, organism);
  } else {
    checkStatus();
  }
  process.exit(0);
}

if (args[0] === '--list') {
  listCached();
  process.exit(0);
}

if (args[0] === '--clear') {
  clearCache(args[1], args[2]);
  process.exit(0);
}

// Default: run research
const geneSymbol = args[0];
const organism = args[1] || 'Escherichia coli';
const language = args[2] || 'English';
const maxResult = parseInt(args[3]) || 5;

runResearch(geneSymbol, organism, language, maxResult);
