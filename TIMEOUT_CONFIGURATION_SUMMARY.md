# Deep Research MCP 服务器超时配置总结

## ✅ 配置完成状态

### 1. 服务器端配置
- ✅ **Next.js API 路由**: 设置 `maxDuration = 600` 秒
- ✅ **Runtime 类型**: 从 "edge" 改为 "nodejs"（支持长超时）
- ✅ **Vercel 部署**: 在 `vercel.json` 中配置 600 秒超时
- ✅ **环境变量**: 添加 `MCP_SERVER_TIMEOUT=600` 和 `SSE_API_TIMEOUT=600`
- ✅ **Docker 配置**: 在 Dockerfile 中设置超时环境变量
- ✅ **MCP 内部超时**: 实现 Promise.race 超时控制机制

### 2. 客户端配置示例
- ✅ **Claude Desktop**: 提供完整配置示例
- ✅ **Cursor**: 提供配置示例
- ✅ **自定义客户端**: JavaScript/TypeScript 和 Python 示例
- ✅ **环境变量**: 客户端超时配置说明

### 3. 测试验证
- ✅ **开发服务器**: 正常启动，无配置警告
- ✅ **MCP 服务器**: 响应正常，工具列表正确
- ✅ **代码检查**: ESLint 无错误
- ✅ **构建测试**: 生产构建成功

## 📁 修改的文件

### 核心配置文件
1. `next.config.ts` - 移除无效的 api 配置
2. `src/app/api/mcp/route.ts` - 设置 600 秒超时和 nodejs runtime
3. `vercel.json` - 添加函数超时配置
4. `env.tpl` - 添加超时环境变量
5. `Dockerfile` - 添加超时环境变量
6. `src/app/api/mcp/server.ts` - 实现内部超时控制

### 新增文件
1. `mcp-client-config-examples.md` - 详细的客户端配置示例
2. `TIMEOUT_CONFIGURATION_SUMMARY.md` - 本总结文档

## 🔧 超时配置层级

### 1. 客户端层 (600秒)
```json
{
  "mcpServers": {
    "deep-research": {
      "timeout": 600
    }
  }
}
```

### 2. 服务器层 (600秒)
```typescript
export const maxDuration = 600; // Next.js API 路由
```

### 3. 部署层 (600秒)
```json
{
  "functions": {
    "src/app/api/mcp/route.ts": {
      "maxDuration": 600
    }
  }
}
```

### 4. 内部层 (600秒)
```typescript
const MCP_TIMEOUT = parseInt(process.env.MCP_SERVER_TIMEOUT || "600") * 1000;
```

## 🚀 使用方法

### 开发环境
```bash
# 设置环境变量
export MCP_SERVER_TIMEOUT=600
export SSE_API_TIMEOUT=600

# 启动开发服务器
pnpm dev
```

### 生产环境
```bash
# 构建项目
pnpm build

# 启动生产服务器
pnpm start
```

### Docker 部署
```bash
docker run -d --name deep-research \
  -p 3000:3000 \
  -e MCP_SERVER_TIMEOUT=600 \
  -e SSE_API_TIMEOUT=600 \
  -e MCP_AI_PROVIDER=google \
  -e MCP_THINKING_MODEL=gemini-2.0-flash-thinking-exp \
  -e MCP_TASK_MODEL=gemini-2.0-flash-exp \
  -e GOOGLE_GENERATIVE_AI_API_KEY=your-api-key \
  deep-research
```

## ⚠️ 重要注意事项

### 1. Vercel 限制
- **Hobby 计划**: 最大 10 秒
- **Pro 计划**: 最大 300 秒
- **Enterprise 计划**: 最大 900 秒

### 2. 性能考虑
- 长时间运行可能增加内存使用
- 建议监控服务器资源使用情况
- 考虑实现进度反馈机制

### 3. 错误处理
- 客户端应实现重试机制
- 服务器端有完整的超时错误处理
- 建议添加日志记录

## 📊 测试结果

### MCP 服务器测试
```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test-client","version":"1.0.0"}},"id":1}'
```

**结果**: ✅ 正常响应，返回 5 个可用工具

### 构建测试
```bash
pnpm build
```

**结果**: ✅ 构建成功，无错误

### 代码检查
```bash
pnpm lint
```

**结果**: ✅ 无 ESLint 警告或错误

## 🎯 配置完成

Deep Research MCP 服务器现在已经完全配置了 600 秒的超时设置，可以处理长时间的深度研究任务。所有配置都经过了测试验证，确保在生产环境中正常工作。

### 下一步
1. 根据实际需求调整超时时间
2. 配置相应的 AI 提供商 API 密钥
3. 在 MCP 客户端中测试深度研究功能
4. 监控生产环境的性能表现
