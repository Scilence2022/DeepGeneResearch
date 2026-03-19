# MCP Client Timeout Configuration Examples

## 1. Claude Desktop Configuration

### Configuration File Location
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### Configuration Content
```json
{
  "mcpServers": {
    "deep-gene-research": {
      "url": "http://127.0.0.1:3000/api/mcp",
      "transportType": "streamable-http",
      "timeout": 900,
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_PASSWORD"
      }
    }
  }
}
```

## 2. Cursor Configuration

### Configuration File Location
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/mcp-config.json`
- **Windows**: `%APPDATA%\Cursor\User\globalStorage\mcp-config.json`

### Configuration Content
```json
{
  "mcpServers": {
    "deep-gene-research": {
      "url": "http://127.0.0.1:3000/api/mcp",
      "transportType": "streamable-http",
      "timeout": 600
    }
  }
}
```

## 3. Cherry Studio Configuration

### Description
Cherry Studio supports the standard MCP protocol configuration, similar to Claude Desktop and Cursor.

### Configuration Content
```json
{
  "mcpServers": {
    "deep-gene-research": {
      "url": "http://127.0.0.1:3000/api/mcp",
      "transportType": "streamable-http",
      "timeout": 600,
      "headers": {
        "Authorization": "Bearer YOUR_ACCESS_PASSWORD"
      }
    }
  }
}
```

### Configuration Steps
1. Open Cherry Studio settings
2. Find the MCP server configuration section
3. Add the above configuration content
4. Save and restart Cherry Studio
5. Use Deep Gene Research MCP tools (like `gene-research`) in conversations

## 4. Custom MCP Client (JavaScript/TypeScript)

### Example
```typescript
import { McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function createMcpClient() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['mcp-client.js'],
    env: {
      MCP_SERVER_URL: 'http://127.0.0.1:3000/api/mcp',
      MCP_TIMEOUT: '600000' // 600 seconds in milliseconds
    }
  });

  const client = new McpClient(
    {
      name: "deep-research-client",
      version: "1.0.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  await client.connect(transport);
  return client;
}

// Usage Example
async function performDeepResearch() {
  const client = await createMcpClient();
  
  try {
    const result = await client.callTool({
      name: "deep-research",
      arguments: {
        query: "Latest applications of AI in healthcare",
        language: "en-US",
        maxResult: 10,
        enableCitationImage: true,
        enableReferences: true
      }
    });
    
    console.log("Research results:", result);
  } catch (error) {
    console.error("Research failed:", error);
  } finally {
    await client.close();
  }
}
```

## 5. Python MCP Client

### Install Dependencies
```bash
pip install mcp
```

### Configuration Example
```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

async def create_mcp_client():
    server_params = StdioServerParameters(
        command="python",
        args=["mcp-server.py"],
        env={
            "MCP_SERVER_URL": "http://127.0.0.1:3000/api/mcp",
            "MCP_TIMEOUT": "600"
        }
    )
    
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            return session

async def perform_deep_research():
    session = await create_mcp_client()
    
    try:
        result = await session.call_tool(
            name="deep-research",
            arguments={
                "query": "Latest applications of AI in healthcare",
                "language": "en-US",
                "maxResult": 10,
                "enableCitationImage": True,
                "enableReferences": True
            }
        )
        
        print("Research results:", result)
    except asyncio.TimeoutError:
        print("Research timeout")
    except Exception as e:
        print(f"Research failed: {e}")
    finally:
        await session.close()

# Run
asyncio.run(perform_deep_research())
```

## 6. Environment Variables Configuration

### Server-Side Environment Variables
```bash
# MCP Server timeout configuration (seconds)
MCP_SERVER_TIMEOUT=600

# SSE API timeout configuration (seconds)
SSE_API_TIMEOUT=600

# AI Provider configuration
MCP_AI_PROVIDER=google
MCP_THINKING_MODEL=gemini-2.0-flash-thinking-exp
MCP_TASK_MODEL=gemini-2.0-flash-exp

# Search engine configuration
MCP_SEARCH_PROVIDER=tavily
TAVILY_API_KEY=your-tavily-key

# Access password
ACCESS_PASSWORD=your-secure-password
```

### Client-Side Environment Variables
```bash
# MCP Client timeout configuration (milliseconds)
MCP_CLIENT_TIMEOUT=600000

# Server address
MCP_SERVER_URL=http://127.0.0.1:3000/api/mcp

# Authentication token
MCP_AUTH_TOKEN=your-access-password
```

## 7. Timeout Configuration Guide

### Timeout Levels
1. **Client Timeout**: 600 seconds - Maximum time for MCP client to wait for server response
2. **Server Timeout**: 600 seconds - Maximum execution time for Next.js API routes
3. **Vercel Timeout**: 600 seconds - Maximum execution time for Vercel functions
4. **Internal Timeout**: 600 seconds - Timeout for MCP server internal tool execution

### Timeout Handling Strategies
- **Client**: Display timeout error, allow user to retry
- **Server**: Return timeout error response
- **Internal**: Throw timeout exception, clean up resources

### Best Practices
1. Adjust timeout based on research complexity
2. Implement retry mechanisms
3. Provide progress feedback
4. Set reasonable default values
5. Monitor timeout frequency
