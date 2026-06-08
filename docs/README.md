# Deep Gene Research Documentation

Welcome to the Deep Gene Research documentation. This index provides an overview of all available documentation and guides.

## Quick Links

| Document | Description |
|----------|-------------|
| [Main README](../README.md) | Project overview, features, and quick start guide |
| [API Documentation](./deep-research-api-doc.md) | SSE API endpoints and event types |
| [MCP Agent Guide](./MCP_AGENT_PROMPT_GUIDE.md) | System prompts for AI agents using MCP tools |
| [Cloudflare Deployment](./How-to-deploy-to-Cloudflare-Pages.md) | Detailed Cloudflare Pages deployment guide |

## Documentation Structure

```
/
├── README.md                    # Main project documentation
├── env.tpl                      # Environment variables template
├── mcp-client-config-examples.md # MCP client configurations
├── MCP_API_USAGE_EXAMPLES.md    # Comprehensive MCP API examples
│
├── docs/
│   ├── README.md                # This documentation index
│   ├── deep-research-api-doc.md # SSE API documentation
│   ├── MCP_AGENT_PROMPT_GUIDE.md # Agent prompt configuration
│   └── How-to-deploy-to-Cloudflare-Pages.md # Deployment guide
│
├── examples/
│   ├── README.md                # Client examples overview
│   ├── mcp-research-client.js   # Node.js client example
│   └── mcp-research-client.py   # Python client example
│
└── src/utils/gene-research/
    └── README.md                # Gene research module docs
```

## Getting Started

### For Researchers
1. Read the [Main README](../README.md) for project overview
2. Follow the Quick Start guide to set up your instance
3. Configure your preferred AI provider

### For Developers
1. Review the [API Documentation](./deep-research-api-doc.md)
2. Check [MCP API Usage Examples](../MCP_API_USAGE_EXAMPLES.md) for integration patterns
3. See [examples/README.md](../examples/README.md) for client implementations

### For Deployment
1. **Vercel**: One-click deploy (see [Main README](../README.md#option-1-one-click-deployment-recommended))
2. **Cloudflare**: Follow [Cloudflare Deployment Guide](./How-to-deploy-to-Cloudflare-Pages.md)
3. **Self-hosted**: Use Docker (see [Main README](../README.md#self-hosted))

## API Integration

### MCP Server
The Deep Gene Research MCP server provides tools for AI assistants:

| Tool | Description |
|------|-------------|
| `deep-gene-research` | Queue complete end-to-end gene research |
| `get-task-status` | Poll queued task status/results |
| `write-research-plan` | Generate research plans |
| `generate-SERP-query` | Create search tasks |
| `search-task` | Execute database searches |
| `write-final-report` | Generate final reports |

**Configuration Examples**: [mcp-client-config-examples.md](../mcp-client-config-examples.md)

### SSE API
Real-time streaming API for gene research:

- **Endpoint**: `/api/sse`
- **Method**: POST
- **Events**: `infor`, `message`, `reasoning`, `progress`, `error`

**Full Documentation**: [deep-research-api-doc.md](./deep-research-api-doc.md)

## Environment Configuration

See [env.tpl](../env.tpl) for all available environment variables including:

- AI provider API keys (Google, OpenAI, Anthropic, etc.)
- Search provider configuration (Tavily, SearXNG, etc.)
- MCP server settings
- Timeout configurations

## Contributing to Documentation

1. Follow Markdown formatting conventions
2. Keep content concise and well-organized
3. Include code examples where helpful
4. Update this index when adding new documentation
5. Test all code examples before committing

## Support

- [GitHub Issues](https://github.com/Scilence2022/DeepGeneResearch/issues)
- [GitHub Discussions](https://github.com/Scilence2022/DeepGeneResearch/discussions)
