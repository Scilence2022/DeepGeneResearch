# MCP Server API Usage Examples

## Overview

The Deep Research MCP server provides 5 main tools for automated gene research:

1. **`deep-gene-research`** - Complete end-to-end gene research (recommended)
2. **`write-research-plan`** - Generate research plan from query
3. **`generate-SERP-query`** - Generate search tasks from plan
4. **`search-task`** - Execute search tasks and collect information
5. **`write-final-report`** - Generate final report from collected data

---

## Setup

### 1. Environment Variables

Create `.env.local` file:

```bash
# Required: AI Provider Configuration
MCP_AI_PROVIDER=google                           # google, openai, anthropic, deepseek, etc.
MCP_THINKING_MODEL=gemini-2.0-flash-thinking-exp # Model for complex reasoning
MCP_TASK_MODEL=gemini-2.0-flash-exp              # Model for task execution
GOOGLE_GENERATIVE_AI_API_KEY=your-api-key

# Required: Search Provider Configuration
MCP_SEARCH_PROVIDER=searxng                      # searxng, tavily, exa, firecrawl
SEARXNG_API_PROXY=https://searx.be               # Public SearXNG instance

# Optional: API Keys for other providers
TAVILY_API_KEY=your-tavily-key
EXA_API_KEY=your-exa-key

# Optional: Access Control
ACCESS_PASSWORD=your-secure-password

# Optional: Timeout Configuration
MCP_SERVER_TIMEOUT=600                           # Timeout in seconds (default: 600)
```

### 2. Start the Server

```bash
# Development
pnpm dev

# Production
pnpm build
pnpm start
```

The MCP server will be available at: `http://localhost:3000/api/mcp`

---

## Example 1: Complete Gene Research (Recommended)

### Python Client

```python
import asyncio
import json
import httpx

async def conduct_gene_research():
    """
    Complete end-to-end gene research using the deep-gene-research tool.
    This is the simplest and most recommended approach.
    """
    
    # MCP server endpoint
    url = "http://localhost:3000/api/mcp"
    
    # Authentication (if ACCESS_PASSWORD is set)
    headers = {
        "Authorization": "Bearer your-access-password",
        "Content-Type": "application/json"
    }
    
    # Research configuration
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "deep-gene-research",
            "arguments": {
                "geneSymbol": "talB",
                "organism": "Escherichia coli",
                "researchFocus": [
                    "molecular_function",
                    "metabolic_pathways",
                    "protein_structure",
                    "regulation"
                ],
                "specificAspects": [
                    "transaldolase mechanism",
                    "pentose phosphate pathway role",
                    "cofactor requirements"
                ],
                "language": "en-US",
                "maxResult": 10,
                "enableCitationImage": True,
                "enableReferences": True
            }
        }
    }
    
    async with httpx.AsyncClient(timeout=600.0) as client:
        print("🔬 Starting gene research for talB in E. coli...")
        
        response = await client.post(url, json=payload, headers=headers)
        result = response.json()
        
        if "error" in result:
            print(f"❌ Error: {result['error']}")
            return None
        
        # Parse the result
        research_data = json.loads(result["result"]["content"][0]["text"])
        
        print("\n✅ Research completed!")
        print(f"📊 Quality Score: {research_data['qualityMetrics']['overallQuality']:.2%}")
        print(f"📈 Data Completeness: {research_data['metadata']['completeness']:.2%}")
        print(f"⏱️  Research Time: {research_data['metadata']['researchTime']/1000:.2f}s")
        print(f"📚 Data Sources: {', '.join(research_data['metadata']['dataSources'])}")
        
        # Save the full report
        report = research_data['report']
        with open('talB_research_report.md', 'w', encoding='utf-8') as f:
            f.write(report['content'])
        
        print("\n📄 Report saved to: talB_research_report.md")
        
        return research_data

# Run the research
asyncio.run(conduct_gene_research())
```

### Node.js/TypeScript Client

```typescript
import fetch from 'node-fetch';
import fs from 'fs/promises';

async function conductGeneResearch() {
  const url = 'http://localhost:3000/api/mcp';
  
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'deep-gene-research',
      arguments: {
        geneSymbol: 'talB',
        organism: 'Escherichia coli',
        researchFocus: [
          'molecular_function',
          'metabolic_pathways',
          'protein_structure'
        ],
        language: 'en-US',
        maxResult: 10,
        enableCitationImage: true,
        enableReferences: true
      }
    }
  };
  
  console.log('🔬 Starting gene research...');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer your-access-password'
    },
    body: JSON.stringify(payload)
  });
  
  const result = await response.json();
  const researchData = JSON.parse(result.result.content[0].text);
  
  console.log('\n✅ Research completed!');
  console.log(`📊 Quality Score: ${(researchData.qualityMetrics.overallQuality * 100).toFixed(2)}%`);
  
  // Save report
  await fs.writeFile(
    'talB_research_report.md',
    researchData.report.content,
    'utf-8'
  );
  
  console.log('📄 Report saved!');
  
  return researchData;
}

conductGeneResearch();
```

### cURL Example

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-access-password" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
      "params": {
        "name": "deep-gene-research",
        "arguments": {
        "geneSymbol": "talB",
        "organism": "Escherichia coli",
        "researchFocus": ["molecular_function", "metabolic_pathways"],
        "language": "en-US",
        "maxResult": 10,
        "enableCitationImage": true,
        "enableReferences": true
      }
    }
  }' | jq '.result.content[0].text | fromjson'
```

---

## Example 2: Step-by-Step Research Workflow

For more control over each phase:

### Python Complete Workflow

```python
import asyncio
import httpx
import json

class DeepResearchClient:
    def __init__(self, base_url="http://localhost:3000/api/mcp", password=None):
        self.base_url = base_url
        self.headers = {
            "Content-Type": "application/json"
        }
        if password:
            self.headers["Authorization"] = f"Bearer {password}"
        self.request_id = 0
    
    async def call_tool(self, tool_name, arguments):
        """Generic tool calling method"""
        self.request_id += 1
        
        payload = {
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments
            }
        }
        
        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post(self.base_url, json=payload, headers=self.headers)
            result = response.json()
            
            if "error" in result:
                raise Exception(f"Tool call failed: {result['error']}")
            
            return json.loads(result["result"]["content"][0]["text"])
    
    async def write_research_plan(self, query, language="en-US"):
        """Step 1: Generate research plan"""
        print(f"📋 Step 1: Generating research plan for: {query}")
        
        result = await self.call_tool("write-research-plan", {
            "query": query,
            "language": language
        })
        
        print(f"✅ Research plan generated:\n{result['reportPlan'][:200]}...\n")
        return result["reportPlan"]
    
    async def generate_serp_queries(self, plan, language="en-US"):
        """Step 2: Generate search tasks"""
        print("🔍 Step 2: Generating search tasks...")
        
        tasks = await self.call_tool("generate-SERP-query", {
            "plan": plan,
            "language": language
        })
        
        print(f"✅ Generated {len(tasks)} search tasks\n")
        return tasks
    
    async def execute_search_tasks(self, tasks, language="en-US", max_result=10):
        """Step 3: Execute searches and collect information"""
        print(f"📚 Step 3: Executing {len(tasks)} search tasks...")
        
        completed_tasks = await self.call_tool("search-task", {
            "tasks": tasks,
            "language": language,
            "maxResult": max_result,
            "enableReferences": True
        })
        
        total_sources = sum(len(task.get("sources", [])) for task in completed_tasks)
        print(f"✅ Collected {total_sources} sources from searches\n")
        
        return completed_tasks
    
    async def write_final_report(self, plan, tasks, language="en-US"):
        """Step 4: Generate final report"""
        print("📄 Step 4: Generating final report...")
        
        report = await self.call_tool("write-final-report", {
            "plan": plan,
            "tasks": tasks,
            "language": language,
            "enableCitationImage": True,
            "enableReferences": True
        })
        
        print("✅ Report generated!\n")
        return report

async def step_by_step_research():
    """Complete research workflow with step-by-step control"""
    
    client = DeepResearchClient(password="your-access-password")
    
    # Define research query
    query = """
    Gene research: talB in Escherichia coli
    
    Research Question:
    What is the function, structure, and biological role of the gene talB in 
    Escherichia coli? Include information about its pathway, regulation, 
    cofactors, substrates, products, and any recent research findings.
    """
    
    try:
        # Step 1: Generate research plan
        plan = await client.write_research_plan(query, language="en-US")
        
        # Step 2: Generate search tasks
        search_tasks = await client.generate_serp_queries(plan, language="en-US")
        
        # Step 3: Execute searches
        completed_tasks = await client.execute_search_tasks(
            search_tasks, 
            language="en-US",
            max_result=10
        )
        
        # Step 4: Generate final report
        report = await client.write_final_report(plan, completed_tasks, language="en-US")
        
        # Save report
        with open('talB_step_by_step_report.md', 'w', encoding='utf-8') as f:
            f.write(report['finalReport'])
        
        print("📊 Research Summary:")
        print(f"   - Total tasks: {len(completed_tasks)}")
        print(f"   - Total sources: {len(report.get('sources', []))}")
        print(f"   - Report length: {len(report['finalReport'])} characters")
        print("\n📄 Report saved to: talB_step_by_step_report.md")
        
        return report
        
    except Exception as e:
        print(f"❌ Research failed: {e}")
        raise

# Run the workflow
asyncio.run(step_by_step_research())
```

---

## Example 3: Batch Research

Process multiple genes automatically:

```python
import asyncio
import httpx
import json
from typing import List, Dict

async def batch_gene_research(genes: List[Dict[str, str]]):
    """
    Conduct research on multiple genes in parallel or sequentially
    
    Args:
        genes: List of dicts with 'geneSymbol' and 'organism'
    """
    
    url = "http://localhost:3000/api/mcp"
    headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer your-access-password"
    }
    
    results = {}
    
    async with httpx.AsyncClient(timeout=600.0) as client:
        for idx, gene_config in enumerate(genes, 1):
            print(f"\n{'='*60}")
            print(f"🔬 [{idx}/{len(genes)}] Researching {gene_config['geneSymbol']} in {gene_config['organism']}")
            print(f"{'='*60}\n")
            
            payload = {
                "jsonrpc": "2.0",
                "id": idx,
                "method": "tools/call",
                    "params": {
                        "name": "deep-gene-research",
                        "arguments": {
                        **gene_config,
                        "language": "en-US",
                        "maxResult": 10,
                        "enableReferences": True
                    }
                }
            }
            
            try:
                response = await client.post(url, json=payload, headers=headers)
                result = response.json()
                
                if "error" in result:
                    print(f"❌ Error: {result['error']}")
                    continue
                
                research_data = json.loads(result["result"]["content"][0]["text"])
                
                # Save individual report
                filename = f"{gene_config['geneSymbol']}_{gene_config['organism'].replace(' ', '_')}_report.md"
                with open(filename, 'w', encoding='utf-8') as f:
                    f.write(research_data['report']['content'])
                
                results[gene_config['geneSymbol']] = research_data
                
                print(f"✅ Completed! Report saved to: {filename}")
                print(f"📊 Quality: {research_data['qualityMetrics']['overallQuality']:.2%}")
                
            except Exception as e:
                print(f"❌ Failed: {e}")
                continue
    
    return results

# Example usage
genes_to_research = [
    {
        "geneSymbol": "talB",
        "organism": "Escherichia coli",
        "researchFocus": ["molecular_function", "metabolic_pathways"]
    },
    {
        "geneSymbol": "lysC",
        "organism": "Escherichia coli",
        "researchFocus": ["enzyme_kinetics", "regulation"]
    },
    {
        "geneSymbol": "thrB",
        "organism": "Escherichia coli",
        "researchFocus": ["protein_structure", "allosteric_regulation"]
    }
]

asyncio.run(batch_gene_research(genes_to_research))
```

---

## Response Format

### deep-gene-research Tool Response

```json
{
  "workflow": {
    "phases": [...],
    "timeline": {...}
  },
  "qualityMetrics": {
    "overallQuality": 0.85,
    "dataCompleteness": 0.90,
    "sourceReliability": 0.88,
    "evidenceStrength": 0.82
  },
  "visualizations": [
    {
      "type": "pathway_diagram",
      "content": "mermaid code..."
    }
  ],
  "report": {
    "title": "Research Report: talB in Escherichia coli",
    "content": "# Full markdown report...",
    "sections": [...]
  },
  "metadata": {
    "researchTime": 45000,
    "dataSources": ["PubMed", "UniProt", "KEGG", "EcoCyc"],
    "confidence": 0.85,
    "completeness": 0.90
  }
}
```

---

## Error Handling

```python
async def safe_gene_research(gene_symbol, organism, max_retries=3):
    """Research with retry logic and error handling"""
    
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=600.0) as client:
                response = await client.post(
                    "http://localhost:3000/api/mcp",
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "tools/call",
                            "params": {
                                "name": "deep-gene-research",
                                "arguments": {
                                    "geneSymbol": gene_symbol,
                                "organism": organism
                            }
                        }
                    }
                )
                
                result = response.json()
                
                if "error" in result:
                    error_msg = result["error"]["message"]
                    
                    if "timeout" in error_msg.lower():
                        print(f"⏱️  Attempt {attempt + 1}: Timeout, retrying...")
                        await asyncio.sleep(5)
                        continue
                    else:
                        raise Exception(error_msg)
                
                return json.loads(result["result"]["content"][0]["text"])
                
        except httpx.TimeoutException:
            if attempt < max_retries - 1:
                print(f"⏱️  Attempt {attempt + 1}: Connection timeout, retrying...")
                await asyncio.sleep(5)
            else:
                raise Exception("Max retries exceeded")
        
        except Exception as e:
            if attempt < max_retries - 1:
                print(f"❌ Attempt {attempt + 1}: {e}, retrying...")
                await asyncio.sleep(5)
            else:
                raise
    
    raise Exception("Research failed after all retries")
```

---

## Performance Optimization

### 1. Adjust Search Results Limit

```python
# For quick overview (faster)
arguments = {
    "geneSymbol": "talB",
    "organism": "Escherichia coli",
    "maxResult": 5  # Fewer sources = faster
}

# For comprehensive research (slower but more thorough)
arguments = {
    "geneSymbol": "talB",
    "organism": "Escherichia coli",
    "maxResult": 20  # More sources = higher quality
}
```

### 2. Focused Research

```python
# Focused on specific aspects (faster)
arguments = {
    "geneSymbol": "talB",
    "organism": "Escherichia coli",
    "specificAspects": ["enzyme mechanism"],  # Only research this
    "researchFocus": ["molecular_function"]
}
```

### 3. Parallel Execution

For multiple genes, consider limiting concurrent requests:

```python
from asyncio import Semaphore

async def batch_research_with_limit(genes, max_concurrent=3):
    semaphore = Semaphore(max_concurrent)
    
    async def limited_research(gene_config):
        async with semaphore:
            return await conduct_gene_research(gene_config)
    
    tasks = [limited_research(gene) for gene in genes]
    return await asyncio.gather(*tasks)
```

---

## Troubleshooting

### Common Issues

1. **Timeout Errors**
   - Increase `MCP_SERVER_TIMEOUT` in `.env.local`
   - Reduce `maxResult` parameter
   - Use focused research instead of comprehensive

2. **Empty Sources**
   - Ensure `MCP_SEARCH_PROVIDER=searxng` (NOT `model`)
   - Check `SEARXNG_API_PROXY` is accessible
   - Verify search provider API keys are valid

3. **API Rate Limits**
   - Add delays between batch requests
   - Use fewer search results
   - Implement exponential backoff

4. **Quality Issues**
   - Increase `maxResult` for more sources
   - Enable `enableQualityControl: true`
   - Use comprehensive research mode

---

## Best Practices

1. **Always use authentication** for production deployments
2. **Set appropriate timeouts** based on research complexity
3. **Monitor search provider** (SearXNG) ensures real database queries
4. **Save results immediately** to avoid data loss
5. **Implement retry logic** for production systems
6. **Use focused research** when possible for better performance
7. **Batch requests carefully** to avoid overwhelming the server

---

## See Also

- [MCP Client Configuration Examples](./mcp-client-config-examples.md)
- [Gene Research Module Documentation](./src/utils/gene-research/README.md)
- [Environment Variables Reference](./.env.example)
