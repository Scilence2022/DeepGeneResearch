# Deploy Deep Gene Research to Cloudflare Pages

This guide provides step-by-step instructions for deploying Deep Gene Research to Cloudflare Pages.

## Prerequisites

Before you begin, ensure you have:

- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- A GitHub account with the repository forked/cloned
- At least one AI provider API key (Google, OpenAI, Anthropic, etc.)
- (Optional) A custom domain name

## Deployment Steps

### 1. Connect Your Repository

1. Log in to the [Cloudflare dashboard](https://dash.cloudflare.com/)
2. Select your account
3. Navigate to **Compute (Workers)** > **Create** > **Pages**
4. Click **Connect to Git**
5. Select your **deep-research** repository
6. Click **Begin Setup**

### 2. Configure Build Settings

| Setting | Value |
|---------|-------|
| Framework preset | `Next.js` |
| Build command | `npx @cloudflare/next-on-pages@1` |
| Build output directory | `.vercel/output/static` |
| Node.js version | `18` or later |

### 3. Set Environment Variables

Add the following environment variables in the Cloudflare dashboard:

#### Required Variables
```bash
# AI Provider (at least one required)
GOOGLE_GENERATIVE_AI_API_KEY=your-google-api-key
# or
OPENAI_API_KEY=your-openai-key
# or
ANTHROPIC_API_KEY=your-anthropic-key
```

#### Optional Variables
```bash
# Access Control
ACCESS_PASSWORD=your-secure-password

# Search Provider
TAVILY_API_KEY=your-tavily-key
EXA_API_KEY=your-exa-key

# MCP Server Configuration
MCP_AI_PROVIDER=google
MCP_THINKING_MODEL=gemini-2.0-flash-thinking-exp
MCP_TASK_MODEL=gemini-2.0-flash-exp
MCP_SEARCH_PROVIDER=searxng
```

### 4. Deploy

1. Click **Save and Deploy**
2. Wait for the build to complete (typically 2-5 minutes)
3. Once deployed, you'll receive a `*.pages.dev` URL

### 5. Verify Deployment

1. Visit your deployed URL
2. Confirm the application loads correctly
3. Test a simple gene research query
4. Verify API connections are working

## Set a Custom Domain (Optional)

Since `pages.dev` domains may be inaccessible in some regions, you can configure a custom domain:

### Steps

1. Navigate to **Compute (Workers)** > **Your Project**
2. Select **Custom Domains** tab
3. Click **Set up a custom domain**
4. Enter your domain name
5. Follow the DNS configuration instructions
6. Wait for SSL certificate provisioning (usually 15-30 minutes)

### DNS Configuration

Add a CNAME record pointing to your Cloudflare Pages URL:

| Type | Name | Content |
|------|------|---------|
| CNAME | `@` or subdomain | `your-project.pages.dev` |

## Troubleshooting

### Build Failures

**Error: Node.js version not supported**
- Solution: Ensure Node.js version is set to 18 or later in build settings

**Error: Missing dependencies**
- Solution: Verify `package.json` includes all required dependencies
- Try clearing build cache and redeploying

### Runtime Errors

**Error: API key not found**
- Solution: Verify environment variables are set correctly in Cloudflare dashboard
- Note: Variables set in `.env.local` are not used in production

**Error: Function timeout**
- Solution: Add `MCP_SERVER_TIMEOUT=600` to environment variables
- Consider using a different AI provider with faster response times

### Access Issues

**Site not loading in certain regions**
- Solution: Configure a custom domain (see above)
- Use Cloudflare's China Network if targeting Chinese users

## Redeployment

To redeploy after making changes:

1. Push changes to your GitHub repository
2. Cloudflare Pages will automatically detect changes and trigger a new build
3. Or manually trigger: **Deployments** > **Redeploy**

## Related Documentation

- [Environment Variables Reference](../env.tpl)
- [MCP API Usage Examples](../MCP_API_USAGE_EXAMPLES.md)
- [Main Documentation](../README.md)

## Support

If you encounter issues not covered here:

1. Check the [GitHub Issues](https://github.com/Scilence2022/DeepGeneResearch/issues)
2. Review Cloudflare Pages [documentation](https://developers.cloudflare.com/pages/)
3. Open a new issue with deployment logs and error messages
