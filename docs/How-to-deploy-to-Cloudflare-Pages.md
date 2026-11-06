# Deploy Deep Gene Research to Cloudflare Pages

Cloudflare Pages serves the static browser UI, including local research history. Deploy a separate long-lived Node worker for durable research, MCP, PDF uploads, and artifact downloads. The static export uses browser-side provider configuration or a separately configured backend.

## Configure the Pages build

Connect the repository to Cloudflare Pages and use the following settings.

| Setting | Value |
| --- | --- |
| Framework preset | Next.js (Static HTML Export), or None with the explicit settings below |
| Build command | `pnpm install --frozen-lockfile && pnpm build:export` |
| Build output directory | `out` |
| Node.js version | Use the exact Node 24 release in [the repository version file](../.node-version) |
| pnpm version | Use the package manager version in [the project manifest](../package.json) |

For a manual upload, run the same build locally and upload the `out` directory. The export includes `_headers` with the report security policy. Configure durable worker credentials on the worker and give MCP clients its URL. [Cloudflare Pages static Next.js deployment](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/) · [Cloudflare Pages custom headers](https://developers.cloudflare.com/pages/configuration/headers/)

## Verify

After deployment, open the home page and a browser-local report. Confirm that the report response includes `Content-Security-Policy`. Run the static deployment probe against the public URL.

```sh
DGR_PROBE_MODE=static DGR_PROBE_URL=https://your-project.pages.dev node scripts/probe-deployment.mjs
```

See the [research operations guide](./research-operations.md) for the worker's deployment and verification steps.
