#!/usr/bin/env python3
"""
MCP Research Client - Python Example

This script demonstrates how to programmatically execute gene research
using the Deep Research MCP server API.

Usage:
    python mcp-research-client.py
    python mcp-research-client.py --batch

Requirements:
    pip install httpx
"""

import asyncio
import json
import os
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Any

try:
    import httpx
except ImportError:
    print("Error: httpx is required. Install it with: pip install httpx")
    sys.exit(1)


# Configuration
class Config:
    MCP_SERVER_URL = os.getenv('MCP_SERVER_URL', 'http://localhost:3000/api/mcp')
    ACCESS_PASSWORD = os.getenv('ACCESS_PASSWORD', '')
    MCP_CLIENT_TIMEOUT = int(os.getenv('MCP_CLIENT_TIMEOUT', '600'))
    OUTPUT_DIR = os.getenv('OUTPUT_DIR', './research-reports')


class MCPResearchClient:
    """Client for Deep Research MCP server"""
    
    def __init__(self, config: Optional[Config] = None):
        self.config = config or Config
        self.request_id = 0
        self.headers = {
            'Content-Type': 'application/json'
        }
        
        if self.config.ACCESS_PASSWORD:
            self.headers['Authorization'] = f'Bearer {self.config.ACCESS_PASSWORD}'
    
    async def call_tool(self, tool_name: str, arguments: Dict[str, Any]) -> Any:
        """Call MCP tool with given name and arguments"""
        self.request_id += 1
        
        payload = {
            'jsonrpc': '2.0',
            'id': self.request_id,
            'method': 'tools/call',
            'params': {
                'name': tool_name,
                'arguments': arguments
            }
        }
        
        async with httpx.AsyncClient(timeout=self.config.MCP_CLIENT_TIMEOUT) as client:
            try:
                response = await client.post(
                    self.config.MCP_SERVER_URL,
                    json=payload,
                    headers=self.headers
                )
                
                result = response.json()
                
                if 'error' in result:
                    raise Exception(f"MCP Error: {result['error']['message']}")
                
                # Parse the response content
                content = result['result']['content'][0]['text']
                return json.loads(content)
                
            except httpx.TimeoutException:
                raise Exception('Request timeout')
            except Exception as e:
                raise Exception(f'Tool call failed: {str(e)}')
    
    async def conduct_gene_research(
        self,
        gene_symbol: str,
        organism: str,
        research_focus: Optional[List[str]] = None,
        specific_aspects: Optional[List[str]] = None,
        disease_context: Optional[str] = None,
        experimental_approach: Optional[str] = None,
        user_prompt: Optional[str] = None,
        language: str = 'en-US',
        max_result: int = 10,
        enable_citation_image: bool = True,
        enable_references: bool = True
    ) -> Dict[str, Any]:
        """Conduct complete gene research (recommended)"""
        
        print(f"\n{'='*60}")
        print(f"🔬 Starting Gene Research")
        print(f"{'='*60}")
        print(f"Gene: {gene_symbol}")
        print(f"Organism: {organism}")
        
        if research_focus:
            print(f"Focus: {', '.join(research_focus)}")
        
        print(f"Max Results: {max_result}")
        print()
        
        start_time = datetime.now()
        
        try:
            result = await self.call_tool('deep-gene-research', {
                'geneSymbol': gene_symbol,
                'organism': organism,
                'researchFocus': research_focus or [],
                'specificAspects': specific_aspects or [],
                'diseaseContext': disease_context,
                'experimentalApproach': experimental_approach,
                'userPrompt': user_prompt,
                'language': language,
                'maxResult': max_result,
                'enableCitationImage': enable_citation_image,
                'enableReferences': enable_references
            })
            
            duration = (datetime.now() - start_time).total_seconds()
            
            print('✅ Research Completed!\n')
            print('📊 Results:')
            print(f"   - Quality Score: {result['qualityMetrics']['overallQuality']*100:.1f}%")
            print(f"   - Data Completeness: {result['metadata']['completeness']*100:.1f}%")
            print(f"   - Confidence: {result['metadata']['confidence']*100:.1f}%")
            print(f"   - Research Time: {duration:.2f}s")
            print(f"   - Data Sources: {', '.join(result['metadata']['dataSources'])}")
            print()
            
            return result
            
        except Exception as e:
            print(f"❌ Research failed: {str(e)}")
            raise
    
    async def step_by_step_research(
        self,
        query: str,
        language: str = 'en-US',
        max_result: int = 10
    ) -> Dict[str, Any]:
        """Step-by-step research workflow"""
        
        print(f"\n{'='*60}")
        print(f"📋 Step-by-Step Research Workflow")
        print(f"{'='*60}\n")
        
        try:
            # Step 1: Generate research plan
            print('📝 Step 1: Generating research plan...')
            plan_result = await self.call_tool('write-research-plan', {
                'query': query,
                'language': language
            })
            print(f"✅ Plan generated ({len(plan_result['reportPlan'])} chars)\n")
            
            # Step 2: Generate search queries
            print('🔍 Step 2: Generating search tasks...')
            search_tasks = await self.call_tool('generate-SERP-query', {
                'plan': plan_result['reportPlan'],
                'language': language
            })
            print(f"✅ Generated {len(search_tasks)} search tasks\n")
            
            # Step 3: Execute searches
            print(f"📚 Step 3: Executing {len(search_tasks)} searches...")
            completed_tasks = await self.call_tool('search-task', {
                'tasks': search_tasks,
                'language': language,
                'maxResult': max_result,
                'enableReferences': True
            })
            
            total_sources = sum(len(task.get('sources', [])) for task in completed_tasks)
            print(f"✅ Collected {total_sources} sources\n")
            
            # Step 4: Generate final report
            print('📄 Step 4: Generating final report...')
            report = await self.call_tool('write-final-report', {
                'plan': plan_result['reportPlan'],
                'tasks': completed_tasks,
                'language': language,
                'maxResult': max_result,
                'enableCitationImage': True,
                'enableReferences': True
            })
            print('✅ Report generated!\n')
            
            return {
                'plan': plan_result['reportPlan'],
                'tasks': completed_tasks,
                'report': report
            }
            
        except Exception as e:
            print(f"❌ Workflow failed: {str(e)}")
            raise
    
    async def save_report(
        self,
        gene_symbol: str,
        organism: str,
        report_content: str,
        output_dir: Optional[str] = None
    ) -> str:
        """Save research report to file"""
        
        output_dir = output_dir or self.config.OUTPUT_DIR
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        # Generate filename
        timestamp = datetime.now().strftime('%Y-%m-%d')
        safe_gene = gene_symbol.replace('/', '_').replace(' ', '_')
        safe_org = organism.replace('/', '_').replace(' ', '_')
        filename = f"{safe_gene}_{safe_org}_{timestamp}.md"
        filepath = Path(output_dir) / filename
        
        # Write report
        filepath.write_text(report_content, encoding='utf-8')
        
        print(f"💾 Report saved: {filepath}")
        return str(filepath)
    
    async def save_research_data(
        self,
        gene_symbol: str,
        organism: str,
        data: Dict[str, Any],
        output_dir: Optional[str] = None
    ) -> str:
        """Save complete research data (JSON)"""
        
        output_dir = output_dir or self.config.OUTPUT_DIR
        Path(output_dir).mkdir(parents=True, exist_ok=True)
        
        # Generate filename
        timestamp = datetime.now().strftime('%Y-%m-%d')
        safe_gene = gene_symbol.replace('/', '_').replace(' ', '_')
        safe_org = organism.replace('/', '_').replace(' ', '_')
        filename = f"{safe_gene}_{safe_org}_{timestamp}_data.json"
        filepath = Path(output_dir) / filename
        
        # Write data
        filepath.write_text(json.dumps(data, indent=2), encoding='utf-8')
        
        print(f"💾 Research data saved: {filepath}")
        return str(filepath)


async def main():
    """Main execution function"""
    
    client = MCPResearchClient()
    
    try:
        # Example: Complete gene research (recommended)
        result = await client.conduct_gene_research(
            gene_symbol='talB',
            organism='Escherichia coli',
            research_focus=[
                'molecular_function',
                'metabolic_pathways',
                'protein_structure',
                'regulation'
            ],
            specific_aspects=[
                'transaldolase mechanism',
                'pentose phosphate pathway',
                'cofactor requirements'
            ],
            language='en-US',
            max_result=10,
            enable_references=True
        )
        
        # Save report
        report_content = result.get('report', {}).get('content') or result.get('finalReport') or ''
        
        if report_content:
            await client.save_report(
                'talB',
                'Escherichia coli',
                report_content
            )
        else:
            print('⚠️  No report content available to save')
        
        # Save complete data
        await client.save_research_data(
            'talB',
            'Escherichia coli',
            result
        )
        
        print('\n✨ Research completed successfully!\n')
        
        # Display summary
        print('📋 Summary:')
        print(f"   - Report available: {'Yes' if report_content else 'No'}")
        print(f"   - Report length: {len(report_content) if report_content else 'N/A'} chars")
        print(f"   - Visualizations: {len(result.get('visualizations', result.get('geneResearch', {}).get('visualizations', [])))}")
        print(f"   - Sources: {len(result.get('sources', []))}")
        print(f"   - Quality metrics available: Yes")
        print()
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}\n")
        sys.exit(1)


async def batch_research():
    """Batch research example"""
    
    client = MCPResearchClient()
    
    genes = [
        {
            'geneSymbol': 'talB',
            'organism': 'Escherichia coli',
            'researchFocus': ['molecular_function', 'metabolic_pathways']
        },
        {
            'geneSymbol': 'lysC',
            'organism': 'Escherichia coli',
            'researchFocus': ['enzyme_kinetics', 'regulation']
        },
        {
            'geneSymbol': 'thrB',
            'organism': 'Escherichia coli',
            'researchFocus': ['protein_structure', 'allosteric_regulation']
        }
    ]
    
    print(f"\n{'='*60}")
    print(f"🔬 Batch Gene Research ({len(genes)} genes)")
    print(f"{'='*60}\n")
    
    results = []
    
    for i, gene_config in enumerate(genes):
        print(f"\n[{i+1}/{len(genes)}] Processing {gene_config['geneSymbol']}...")
        
        try:
            result = await client.conduct_gene_research(
                **gene_config,
                language='en-US',
                max_result=10,
                enable_references=True
            )
            
            report_content = result.get('report', {}).get('content') or result.get('finalReport') or ''
            
            if report_content:
                await client.save_report(
                    gene_config['geneSymbol'],
                    gene_config['organism'],
                    report_content
                )
            
            results.append({
                'gene': gene_config['geneSymbol'],
                'success': True,
                'result': result
            })
            
            # Add delay between requests
            if i < len(genes) - 1:
                print('⏳ Waiting 5s before next request...')
                await asyncio.sleep(5)
                
        except Exception as e:
            print(f"Failed: {str(e)}")
            results.append({
                'gene': gene_config['geneSymbol'],
                'success': False,
                'error': str(e)
            })
    
    # Summary
    print(f"\n{'='*60}")
    print('📊 Batch Research Summary')
    print(f"{'='*60}\n")
    
    successful = sum(1 for r in results if r['success'])
    failed = len(results) - successful
    
    print(f"✅ Successful: {successful}/{len(genes)}")
    print(f"❌ Failed: {failed}/{len(genes)}")
    print()
    
    for r in results:
        status = '✅' if r['success'] else '❌'
        msg = 'Success' if r['success'] else r.get('error', 'Unknown error')
        print(f"{status} {r['gene']}: {msg}")
    print()


if __name__ == '__main__':
    # Check command line arguments
    if '--batch' in sys.argv:
        asyncio.run(batch_research())
    elif '--help' in sys.argv or '-h' in sys.argv:
        print("""
Usage: python mcp-research-client.py [options]

Options:
  --batch          Run batch research on multiple genes
  --help, -h       Show this help message

Environment Variables:
  MCP_SERVER_URL        MCP server URL (default: http://localhost:3000/api/mcp)
  ACCESS_PASSWORD       Access password for authentication
  MCP_CLIENT_TIMEOUT    Request timeout in seconds (default: 600)
  OUTPUT_DIR            Output directory for reports (default: ./research-reports)

Examples:
  # Single gene research
  python mcp-research-client.py

  # Batch research
  python mcp-research-client.py --batch

  # With custom configuration
  MCP_SERVER_URL=http://example.com/api/mcp ACCESS_PASSWORD=secret python mcp-research-client.py
""")
    else:
        asyncio.run(main())
