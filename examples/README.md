# MCP Research Client Examples

Practical examples for using the Deep Research MCP server to programmatically execute gene research.

## Available Examples

### 1. Node.js Client (`mcp-research-client.js`)
- ✅ **No dependencies required** - uses built-in Node.js modules
- Complete gene research
- Step-by-step workflow
- Batch processing
- Error handling

### 2. Python Client (`mcp-research-client.py`)
- Async/await with httpx
- Complete gene research
- Step-by-step workflow  
- Batch processing
- Error handling

## Quick Start

### Node.js

```bash
# No installation needed - uses built-in modules
node mcp-research-client.js

# Batch research
node mcp-research-client.js --batch

# Help
node mcp-research-client.js --help
```

### Python

```bash
# Install dependencies
pip install -r requirements.txt

# Run
python mcp-research-client.py

# Batch research
python mcp-research-client.py --batch

# Help
python mcp-research-client.py --help
```

## Prerequisites

1. **MCP Server Running**
   ```bash
   # In the main project directory
   pnpm dev
   # Server will be at: http://localhost:3000/api/mcp
   ```

2. **Environment Variables**
   
   Create `.env.local` in the project root:
   ```bash
   # AI Provider (REQUIRED)
   MCP_AI_PROVIDER=google
   MCP_THINKING_MODEL=gemini-2.0-flash-thinking-exp
   MCP_TASK_MODEL=gemini-2.0-flash-exp
   GOOGLE_GENERATIVE_AI_API_KEY=your-api-key
   
   # Search Provider (CRITICAL: Must be searxng, NOT model!)
   MCP_SEARCH_PROVIDER=searxng
   SEARXNG_API_PROXY=https://searx.be
   
   # Optional
   ACCESS_PASSWORD=your-secure-password
   MCP_SERVER_TIMEOUT=600
   ```

## Usage Examples

### Single Gene Research

**Node.js:**
```javascript
const { MCPResearchClient } = require('./mcp-research-client');

const client = new MCPResearchClient();

const result = await client.conductGeneResearch({
  geneSymbol: 'talB',
  organism: 'Escherichia coli',
  researchFocus: ['molecular_function', 'metabolic_pathways'],
  maxResult: 10
});

await client.saveReport('talB', 'Escherichia coli', result.report.content);
```

**Python:**
```python
from mcp_research_client import MCPResearchClient

client = MCPResearchClient()

result = await client.conduct_gene_research(
    gene_symbol='talB',
    organism='Escherichia coli',
    research_focus=['molecular_function', 'metabolic_pathways'],
    max_result=10
)

await client.save_report('talB', 'Escherichia coli', result['report']['content'])
```

### Batch Processing

Process multiple genes automatically:

```bash
# Node.js
node mcp-research-client.js --batch

# Python
python mcp-research-client.py --batch
```

### Custom Configuration

```bash
# Node.js
MCP_SERVER_URL=http://example.com/api/mcp \
ACCESS_PASSWORD=secret \
OUTPUT_DIR=./my-reports \
node mcp-research-client.js

# Python
MCP_SERVER_URL=http://example.com/api/mcp \
ACCESS_PASSWORD=secret \
OUTPUT_DIR=./my-reports \
python mcp-research-client.py
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_SERVER_URL` | `http://localhost:3000/api/mcp` | MCP server endpoint |
| `ACCESS_PASSWORD` | _(empty)_ | Authentication password |
| `MCP_CLIENT_TIMEOUT` | `600` (Python) / `600000` (Node.js) | Timeout in seconds/ms |
| `OUTPUT_DIR` | `./research-reports` | Output directory for reports |

## Output Files

Both scripts generate:

1. **Markdown Reports** (`{gene}_{organism}_{date}.md`)
   - Human-readable research report
   - Includes citations and references
   - Visualizations (mermaid diagrams)

2. **JSON Data** (`{gene}_{organism}_{date}_data.json`)
   - Complete research data
   - Quality metrics
   - Workflow information
   - Source URLs and metadata

Example output:
```
research-reports/
├── talB_Escherichia_coli_2025-11-16.md
├── talB_Escherichia_coli_2025-11-16_data.json
├── lysC_Escherichia_coli_2025-11-16.md
└── lysC_Escherichia_coli_2025-11-16_data.json
```

## Features

### ✅ Complete Gene Research (Recommended)
- Single API call
- Automatic database querying (PubMed, UniProt, KEGG, etc.)
- Quality metrics
- Visualizations
- Citation tracking

### 📋 Step-by-Step Workflow
- Research plan generation
- Search task creation
- Information collection
- Report generation
- Full control over each phase

### 🔄 Batch Processing
- Process multiple genes
- Automatic rate limiting
- Error recovery
- Progress tracking
- Summary statistics

### 🛡️ Error Handling
- Timeout management
- Retry logic
- Detailed error messages
- Graceful degradation

## Troubleshooting

### Connection Refused
- Ensure MCP server is running: `pnpm dev`
- Check `MCP_SERVER_URL` is correct

### Empty Sources in Results
- Verify `MCP_SEARCH_PROVIDER=searxng` (NOT `model`)
- Check `SEARXNG_API_PROXY` is accessible
- Test: `curl https://searx.be`

### Timeout Errors
- Increase timeout: `MCP_SERVER_TIMEOUT=1200`
- Reduce search results: `maxResult: 5`
- Use focused research instead of comprehensive

### Import Errors (Python)
```bash
pip install httpx
```

## Advanced Usage

See the full documentation:
- [MCP API Usage Examples](../MCP_API_USAGE_EXAMPLES.md)
- [MCP Client Configuration](../mcp-client-config-examples.md)

## License

MIT
