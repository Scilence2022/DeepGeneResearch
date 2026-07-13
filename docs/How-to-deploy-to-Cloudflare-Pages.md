# Deploy Deep Gene Research to Cloudflare Pages

This guide provides step-by-step instructions for deploying the stateless Deep Gene Research web interface to Cloudflare Pages.

> **Deployment boundary:** Cloudflare Pages is suitable for the interactive UI and request-scoped APIs only. It is not a durable worker for queued MCP research. The `deep-gene-research` MCP tool requires a long-lived, single-process Node deployment with a persistent `MCP_TASK_STORAGE_FILE`; production Cloudflare Pages deployments intentionally fail closed instead of storing tasks on an ephemeral filesystem.

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
| Node.js version | `18.18.0` or later |

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

# Required for protected crawler and MCP routes (at least 16 characters)
ACCESS_PASSWORD=replace-with-a-long-random-secret
```

#### Optional Variables
```bash
# Search Provider
TAVILY_API_KEY=your-tavily-key
EXA_API_KEY=your-exa-key
```

`ACCESS_PASSWORD` is one service-wide secret. Store it in Cloudflare's encrypted environment settings and rotate it if exposed. The protected routes return a configuration error when the value is missing or shorter than 16 characters.

Do not set `MCP_TASK_STORAGE_FILE`, `DGR_WORKER_COUNT`, or `DGR_ALLOW_EPHEMERAL_TASK_STORAGE` expecting durable queued research on Pages. Cloudflare's production filesystem is ephemeral, and the development override does not enable it in production. Deploy the MCP worker separately on persistent infrastructure and point MCP clients or CodeXomics at that service.

### 4. Deploy

1. Click **Save and Deploy**
2. Wait for the build to complete (typically 2-5 minutes)
3. Once deployed, you'll receive a `*.pages.dev` URL

### 5. Verify Deployment

1. Visit your deployed URL
2. Confirm the application loads correctly
3. Test a request-scoped UI query
4. Verify API connections are working

Do not validate this deployment by queueing `deep-gene-research`; that workflow is unsupported on Cloudflare Pages. Test it against the separate long-lived MCP worker instead.

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
- Solution: Ensure Node.js version is set to 18.18.0 or later in build settings

**Error: Missing dependencies**
- Solution: Verify `package.json` includes all required dependencies
- Try clearing build cache and redeploying

### Runtime Errors

**Error: API key not found**
- Solution: Verify environment variables are set correctly in Cloudflare dashboard
- Note: Variables set in `.env.local` are not used in production

**Error: Durable MCP research is unavailable or task storage fails closed**
- This is expected on Cloudflare Pages production because its function filesystem is ephemeral.
- Run DGR as one long-lived Node process with persistent storage; do not try to solve this with a larger timeout or the ephemeral-storage development override.

**Error: Request-scoped function timeout**
- Cloudflare enforces platform execution limits. Reduce the request scope or move long-running research to the separate durable MCP worker.

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

For MCP deployment, follow the self-hosted operational requirements in the main documentation rather than this Pages guide.

## Support

If you encounter issues not covered here:

1. Check the [GitHub Issues](https://github.com/Scilence2022/DeepGeneResearch/issues)
2. Review Cloudflare Pages [documentation](https://developers.cloudflare.com/pages/)
3. Open a new issue with deployment logs and error messages
