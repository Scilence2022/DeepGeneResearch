# MCP 客户端超时配置示例

## 1. Claude Desktop 配置

### 配置文件位置
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

### 配置内容
```json
{
  "mcpServers": {
    "deep-research": {
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

## 2. Cursor 配置

### 配置文件位置
- **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/mcp-config.json`
- **Windows**: `%APPDATA%\Cursor\User\globalStorage\mcp-config.json`

### 配置内容
```json
{
  "mcpServers": {
    "deep-research": {
      "url": "http://127.0.0.1:3000/api/mcp",
      "transportType": "streamable-http",
      "timeout": 600
    }
  }
}
```

## 3. Cherry Studio 配置

### 配置说明
Cherry Studio supports the standard MCP protocol configuration, similar to Claude Desktop and Cursor.

### 配置内容
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

### 配置步骤
1. Open Cherry Studio settings
2. Find the MCP server configuration section
3. Add the above configuration content
4. Save and restart Cherry Studio
5. Use Deep Gene Research MCP tools (like `gene-research`) in conversations

## 4. 自定义 MCP 客户端

### JavaScript/TypeScript 示例
```typescript
import { McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function createMcpClient() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['mcp-client.js'],
    env: {
      MCP_SERVER_URL: 'http://127.0.0.1:3000/api/mcp',
      MCP_TIMEOUT: '600000' // 600秒，以毫秒为单位
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

// 使用示例
async function performDeepResearch() {
  const client = await createMcpClient();
  
  try {
    const result = await client.callTool({
      name: "deep-research",
      arguments: {
        query: "人工智能在医疗领域的最新应用",
        language: "zh-CN",
        maxResult: 10,
        enableCitationImage: true,
        enableReferences: true
      }
    });
    
    console.log("研究结果:", result);
  } catch (error) {
    console.error("研究失败:", error);
  } finally {
    await client.close();
  }
}
```

## 4. Python MCP 客户端

### 安装依赖
```bash
pip install mcp
```

### 配置示例
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
                "query": "人工智能在医疗领域的最新应用",
                "language": "zh-CN",
                "maxResult": 10,
                "enableCitationImage": True,
                "enableReferences": True
            }
        )
        
        print("研究结果:", result)
    except asyncio.TimeoutError:
        print("研究超时")
    except Exception as e:
        print(f"研究失败: {e}")
    finally:
        await session.close()

# 运行
asyncio.run(perform_deep_research())
```

## 5. 环境变量配置

### 服务器端环境变量
```bash
# MCP 服务器超时配置（秒）
MCP_SERVER_TIMEOUT=600

# SSE API 超时配置（秒）
SSE_API_TIMEOUT=600

# AI 提供商配置
MCP_AI_PROVIDER=google
MCP_THINKING_MODEL=gemini-2.0-flash-thinking-exp
MCP_TASK_MODEL=gemini-2.0-flash-exp

# 搜索引擎配置
MCP_SEARCH_PROVIDER=tavily
TAVILY_API_KEY=your-tavily-key

# 访问密码
ACCESS_PASSWORD=your-secure-password
```

### 客户端环境变量
```bash
# MCP 客户端超时配置（毫秒）
MCP_CLIENT_TIMEOUT=600000

# 服务器地址
MCP_SERVER_URL=http://127.0.0.1:3000/api/mcp

# 认证令牌
MCP_AUTH_TOKEN=your-access-password
```

## 6. 超时配置说明

### 各层级超时设置
1. **客户端超时**: 600秒 - MCP 客户端等待服务器响应的最大时间
2. **服务器超时**: 600秒 - Next.js API 路由的最大执行时间
3. **Vercel 超时**: 600秒 - Vercel 函数的最大执行时间
4. **内部超时**: 600秒 - MCP 服务器内部工具执行的超时时间

### 超时处理策略
- **客户端**: 显示超时错误，允许用户重试
- **服务器**: 返回超时错误响应
- **内部**: 抛出超时异常，清理资源

### 最佳实践
1. 根据研究复杂度调整超时时间
2. 实现重试机制
3. 提供进度反馈
4. 设置合理的默认值
5. 监控超时频率
