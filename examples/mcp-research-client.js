#!/usr/bin/env node

/**
 * MCP Research Client - Node.js Example
 * 
 * This script demonstrates how to programmatically execute gene research
 * using the Deep Research MCP server API.
 * 
 * Usage:
 *   node mcp-research-client.js
 * 
 * Requirements:
 *   - MCP server running at http://localhost:3000/api/mcp
 *   - Environment variables configured (see .env.local.example)
 */

const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
  mcpServerUrl: process.env.MCP_SERVER_URL || 'http://localhost:3000/api/mcp',
  accessPassword: process.env.ACCESS_PASSWORD || '',
  timeout: parseInt(process.env.MCP_CLIENT_TIMEOUT || '600000'), // 10 minutes
  outputDir: process.env.OUTPUT_DIR || './research-reports'
};

/**
 * MCP Client for Deep Research
 */
class MCPResearchClient {
  constructor(config) {
    this.config = config;
    this.requestId = 0;
  }

  /**
   * Call MCP tool with given name and arguments
   */
  async callTool(toolName, args) {
    this.requestId++;
    
    const payload = {
      jsonrpc: '2.0',
      id: this.requestId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    const headers = {
      'Content-Type': 'application/json'
    };

    if (this.config.accessPassword) {
      headers['Authorization'] = `Bearer ${this.config.accessPassword}`;
    }

    try {
      const result = await this.makeRequest(payload, headers);
      
      if (result.error) {
        throw new Error(`MCP Error: ${result.error.message}`);
      }

      // Parse the response content
      const content = result.result.content[0].text;
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Tool call failed: ${error.message}`);
    }
  }

  /**
   * Make HTTP request to MCP server
   */
  makeRequest(payload, headers) {
    return new Promise((resolve, reject) => {
      const url = new URL(this.config.mcpServerUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(JSON.stringify(payload))
        },
        timeout: this.config.timeout
      };

      const req = client.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(JSON.stringify(payload));
      req.end();
    });
  }

  /**
   * Conduct complete gene research (recommended)
   */
  async conductGeneResearch(options) {
    const {
      geneSymbol,
      organism,
      researchFocus = [],
      specificAspects = [],
      diseaseContext,
      experimentalApproach,
      userPrompt,
      language = 'en-US',
      maxResult = 10,
      enableCitationImage = true,
      enableReferences = true
    } = options;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔬 Starting Gene Research`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Gene: ${geneSymbol}`);
    console.log(`Organism: ${organism}`);
    if (researchFocus.length > 0) {
      console.log(`Focus: ${researchFocus.join(', ')}`);
    }
    console.log(`Max Results: ${maxResult}`);
    console.log('');

    const startTime = Date.now();

    try {
      const result = await this.callTool('gene-research', {
        geneSymbol,
        organism,
        researchFocus,
        specificAspects,
        diseaseContext,
        experimentalApproach,
        userPrompt,
        language,
        maxResult,
        enableCitationImage,
        enableReferences
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('✅ Research Completed!\n');
      console.log('📊 Results:');
      console.log(`   - Quality Score: ${(result.qualityMetrics.overallQuality * 100).toFixed(1)}%`);
      console.log(`   - Data Completeness: ${(result.metadata.completeness * 100).toFixed(1)}%`);
      console.log(`   - Confidence: ${(result.metadata.confidence * 100).toFixed(1)}%`);
      console.log(`   - Research Time: ${duration}s`);
      console.log(`   - Data Sources: ${result.metadata.dataSources.join(', ')}`);
      console.log('');

      return result;
    } catch (error) {
      console.error(`❌ Research failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Step-by-step research workflow
   */
  async stepByStepResearch(query, language = 'en-US', maxResult = 10) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📋 Step-by-Step Research Workflow`);
    console.log(`${'='.repeat(60)}\n`);

    try {
      // Step 1: Generate research plan
      console.log('📝 Step 1: Generating research plan...');
      const planResult = await this.callTool('write-research-plan', {
        query,
        language
      });
      console.log(`✅ Plan generated (${planResult.reportPlan.length} chars)\n`);

      // Step 2: Generate search queries
      console.log('🔍 Step 2: Generating search tasks...');
      const searchTasks = await this.callTool('generate-SERP-query', {
        plan: planResult.reportPlan,
        language
      });
      console.log(`✅ Generated ${searchTasks.length} search tasks\n`);

      // Step 3: Execute searches
      console.log(`📚 Step 3: Executing ${searchTasks.length} searches...`);
      const completedTasks = await this.callTool('search-task', {
        tasks: searchTasks,
        language,
        maxResult,
        enableReferences: true
      });
      
      const totalSources = completedTasks.reduce(
        (sum, task) => sum + (task.sources?.length || 0),
        0
      );
      console.log(`✅ Collected ${totalSources} sources\n`);

      // Step 4: Generate final report
      console.log('📄 Step 4: Generating final report...');
      const report = await this.callTool('write-final-report', {
        plan: planResult.reportPlan,
        tasks: completedTasks,
        language,
        maxResult,
        enableCitationImage: true,
        enableReferences: true
      });
      console.log('✅ Report generated!\n');

      return {
        plan: planResult.reportPlan,
        tasks: completedTasks,
        report
      };
    } catch (error) {
      console.error(`❌ Workflow failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save research report to file
   */
  async saveReport(geneSymbol, organism, reportContent, outputDir) {
    try {
      // Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const safeGene = geneSymbol.replace(/[^a-zA-Z0-9]/g, '_');
      const safeOrg = organism.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${safeGene}_${safeOrg}_${timestamp}.md`;
      const filepath = path.join(outputDir, filename);

      // Write report
      await fs.writeFile(filepath, reportContent, 'utf-8');

      console.log(`💾 Report saved: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error(`Failed to save report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save complete research data (JSON)
   */
  async saveResearchData(geneSymbol, organism, data, outputDir) {
    try {
      await fs.mkdir(outputDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const safeGene = geneSymbol.replace(/[^a-zA-Z0-9]/g, '_');
      const safeOrg = organism.replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${safeGene}_${safeOrg}_${timestamp}_data.json`;
      const filepath = path.join(outputDir, filename);

      await fs.writeFile(filepath, JSON.stringify(data, null, 2), 'utf-8');

      console.log(`💾 Research data saved: ${filepath}`);
      return filepath;
    } catch (error) {
      console.error(`Failed to save research data: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const client = new MCPResearchClient(CONFIG);

  try {
    // Example 1: Complete gene research (recommended)
    const researchResult = await client.conductGeneResearch({
      geneSymbol: 'talB',
      organism: 'Escherichia coli',
      researchFocus: [
        'molecular_function',
        'metabolic_pathways',
        'protein_structure',
        'regulation'
      ],
      specificAspects: [
        'transaldolase mechanism',
        'pentose phosphate pathway',
        'cofactor requirements'
      ],
      language: 'en-US',
      maxResult: 10,
      enableReferences: true
    });

    // Save report - prioritize finalReport (the complete markdown content)
    const reportContent = researchResult.finalReport || 
                         researchResult.report?.content || 
                         (researchResult.report?.sections ? 
                           researchResult.report.sections.map(s => s.content).join('\n\n') : 
                           '');
    
    if (reportContent) {
      await client.saveReport(
        'talB',
        'Escherichia coli',
        reportContent,
        CONFIG.outputDir
      );
    } else {
      console.log('⚠️  No report content available to save');
    }

    // Save complete data
    await client.saveResearchData(
      'talB',
      'Escherichia coli',
      researchResult,
      CONFIG.outputDir
    );

    console.log('\n✨ Research completed successfully!\n');
    
    // Display summary
    console.log('📋 Summary:');
    console.log(`   - Report available: ${reportContent ? 'Yes' : 'No'}`);
    console.log(`   - Report length: ${reportContent ? reportContent.length + ' chars' : 'N/A'}`);
    console.log(`   - Visualizations: ${researchResult.visualizations?.length || researchResult.geneResearch?.visualizations?.length || 0}`);
    console.log(`   - Sources: ${researchResult.sources?.length || 0}`);
    console.log(`   - Quality metrics available: Yes`);
    console.log('');

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Batch research example
 */
async function batchResearch() {
  const client = new MCPResearchClient(CONFIG);

  const genes = [
    {
      geneSymbol: 'talB',
      organism: 'Escherichia coli',
      researchFocus: ['molecular_function', 'metabolic_pathways']
    },
    {
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      researchFocus: ['enzyme_kinetics', 'regulation']
    },
    {
      geneSymbol: 'thrB',
      organism: 'Escherichia coli',
      researchFocus: ['protein_structure', 'allosteric_regulation']
    }
  ];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔬 Batch Gene Research (${genes.length} genes)`);
  console.log(`${'='.repeat(60)}\n`);

  const results = [];

  for (let i = 0; i < genes.length; i++) {
    const gene = genes[i];
    console.log(`\n[${ i + 1}/${genes.length}] Processing ${gene.geneSymbol}...`);

    try {
      const result = await client.conductGeneResearch({
        ...gene,
        language: 'en-US',
        maxResult: 10,
        enableReferences: true
      });

      const reportContent = result.report?.content || result.finalReport || '';
      
      if (reportContent) {
        await client.saveReport(
          gene.geneSymbol,
          gene.organism,
          reportContent,
          CONFIG.outputDir
        );
      }

      results.push({ gene: gene.geneSymbol, success: true, result });
      
      // Add delay between requests to avoid overwhelming the server
      if (i < genes.length - 1) {
        console.log('⏳ Waiting 5s before next request...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (error) {
      console.error(`Failed: ${error.message}`);
      results.push({ gene: gene.geneSymbol, success: false, error: error.message });
    }
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Batch Research Summary');
  console.log(`${'='.repeat(60)}\n`);
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Successful: ${successful}/${genes.length}`);
  console.log(`❌ Failed: ${failed}/${genes.length}`);
  console.log('');

  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} ${r.gene}: ${r.success ? 'Success' : r.error}`);
  });
  console.log('');
}

// Export for use as module
module.exports = { MCPResearchClient, CONFIG };

// Run main function if executed directly
if (require.main === module) {
  // Check command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--batch')) {
    batchResearch().catch(error => {
      console.error(error);
      process.exit(1);
    });
  } else if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node mcp-research-client.js [options]

Options:
  --batch          Run batch research on multiple genes
  --help, -h       Show this help message

Environment Variables:
  MCP_SERVER_URL        MCP server URL (default: http://localhost:3000/api/mcp)
  ACCESS_PASSWORD       Access password for authentication
  MCP_CLIENT_TIMEOUT    Request timeout in ms (default: 600000)
  OUTPUT_DIR            Output directory for reports (default: ./research-reports)

Examples:
  # Single gene research
  node mcp-research-client.js

  # Batch research
  node mcp-research-client.js --batch

  # With custom configuration
  MCP_SERVER_URL=http://example.com/api/mcp ACCESS_PASSWORD=secret node mcp-research-client.js
`);
  } else {
    main().catch(error => {
      console.error(error);
      process.exit(1);
    });
  }
}
