# Deep Gene Research operations

## Deployment and access

| Mode | Browser UI | Provider API proxy | Durable tasks, PDF uploads, progress, and artifacts |
| --- | --- | --- | --- |
| Long-lived Node or Docker | Yes | With signed browser credentials and server configuration | Yes, on a persistent local volume |
| Vercel UI deployment | Yes | When configured for that runtime | Use a separate long-lived worker |
| Static export on Cloudflare Pages or another static host | Yes | Configure an external backend or direct provider access | Use a separate long-lived worker |

Use `MCP_SERVER_BASE_URL` for the trusted public worker URL. Configure `DGR_ALLOWED_ORIGINS` for browser origins that connect to the worker. Clients send an `Authorization: Bearer` header on REST, MCP, downloads, and both sides of an SSE session. The progress SSE endpoint sends a current snapshot with a monotonic event ID, including the terminal state after reconnect. Fetch the large result through its separate endpoint. Keep secrets out of URLs.

`ACCESS_PASSWORD` continues to identify the legacy workspace and is used by the existing signed browser proxy. Set `DGR_WORKSPACE_TOKENS` to a JSON object mapping named workspaces to distinct random 32–256 character tokens. IDs use lowercase ASCII letters, digits, and hyphens. For exact-target CodeXomics requests, use the same workspace identifier in the token configuration and target. Existing ledger rows belong to the legacy workspace. Named workspace tokens scope task admission, reads, cancellation, downloads, uploaded PDF content, and cache entries. Keep the mapping in the deployment secret manager.

The worker enforces request rate, active and daily task admission, synchronous tool concurrency, input size, PDF storage, and per-attempt research budgets. The browser proxy has a separate per-instance request limit for the shared credential. These counters bound admitted work and covered resource usage. Provider billing and horizontally deployed edge limits require provider or gateway quotas.

## Storage and recovery

Mount a private persistent volume for both `MCP_TASK_STORAGE_FILE` and `MCP_RESEARCH_DOCUMENT_STORAGE_DIR`. A worker owns the ledger using an OS-backed SQLite lock. Point each independent deployment at its own ledger and document root. Use one worker on a local filesystem with reliable SQLite locking.

JSON remains the default ledger backend. To migrate, stop the worker and snapshot the ledger, result sidecars, and uploaded documents together. Set `DGR_TASK_BACKEND=sqlite` and start the worker. It validates the old ledger and the referenced result hashes before committing the import. The old JSON file is kept as an import-time snapshot. Verify task counts, a sampled historical download, a scoped listing, and a newly completed task before taking a new backup. Rollback restores the full pre-import snapshot in a separate directory, then starts the JSON backend against that restored path. The live SQLite file and an old JSON snapshot represent different points in time after subsequent writes.

Run the archive audit against a copy of a historical JSON ledger and its sidecars. It flags old snippet evidence, conflicting identifiers, unreadable sidecars, and credential-like URL parameters. A credential finding needs review to determine whether the value was sensitive and remains valid.

```sh
node scripts/audit-research-archives.mjs /path/to/tasks.json
```

Retention is operator-controlled. Preview the counts first. After taking a backup and stopping the worker, repeat with `--apply`. Cleanup preserves pending, running, and cancellation-requested tasks and every document referenced by a retained task. A result sidecar or PDF must also be older than the retention threshold before removal. When restoring an import snapshot, restore its matching artifacts and documents.

```sh
node scripts/prune-research-data.mjs /path/to/tasks.json /path/to/documents 90
```

## Verification

`pnpm smoke:standalone` uses a synthetic upstream and exercises bearer isolation, signed browser proxy access, streamable MCP and legacy SSE, terminal reconnect, restart recovery, and SQLite import. The Chromium smoke seeds a synthetic report in browser storage and checks the actual report view for unsafe embeds, disabled images, CSP, and normal Markdown rendering. The Docker context check exports a synthetic build stage and verifies exclusion of runtime canaries.

Set `DGR_PROBE_URL` and `DGR_PROBE_TOKEN` before running `node scripts/probe-deployment.mjs` against a worker. Set `DGR_PROBE_LIVE_PROVIDER=1` to issue one billable, synthetic model request through the worker. Set `DGR_PROBE_MODE=static` for an unauthenticated static-host probe. Hosted deployments should send the same frame, object, inline event-handler, and referrer policy headers as the Node host. Verify the browser test against the hosted policy after deployment.

## Evidence evaluation

`pnpm test` runs the synthetic evidence benchmark alongside the exact-target, noncoding, and proposal-integrity regressions. New DOI-only and uploaded-PDF excerpts are available in `dgr.review-evidence.v1`. They carry locators, page information where available, hashes, and offsets. They are for review and have no ChangeSet write eligibility. The exact-target report remains the citation-bound artifact and any exploratory narrative is marked unverified.

For reviewer-labeled quality evaluations, create a private `dgr.quality-labels.v1` JSON file containing a `cases` array. Each case supplies an `artifact` path relative to the label file, a `stratum`, a `target` with workspace, genome, feature, feature hash, chromosome, organism and revision, an array of expected `claims` containing `statement` and `citation` objects with `type` and `id`, and an `allowedOperations` array of field names. Use the exact statement and work citation labeled by the reviewer. The evaluator reports sample counts, precision, recall, target accuracy, and abstention by stratum. `--require-safety` fails on unexpected claims, unexpected operation fields, or target mismatch. Maintain independent reviewer labels for scientific quality measurements.

```sh
node scripts/evaluate-research-quality.mjs /path/to/labels.json --require-safety
```

## Telemetry and cost

Set `DGR_RESEARCH_TELEMETRY=1` to emit lifecycle events with stable task IDs, timings, artifact sizes, and bounded diagnostic codes. Pipe a bounded observation window into `node scripts/summarize-research-telemetry.mjs` to get event totals, queue and phase p95, cancellation latency, and artifact sizes. Keep the same window and rate version when comparing runs.

Optional `DGR_LLM_RATE_TABLE` is a `dgr.llm-rates.v1` JSON object with a `version`, `currency` set to `USD`, and a `models` object keyed by `provider/model`. Each entry specifies `input`, `cachedInput`, and `output` prices per million tokens. Use the provider's applicable rates and keep the version with the billing period. Unknown models or missing usage are marked incomplete. Missing cache breakdown uses the standard input rate. Replay cost is zero and the original execution estimate is recorded separately. Compare estimates for completed attempts with billing for the same period, accounting separately for failed attempts and unreported usage.
