# Full-Text Evidence Providers

This guide covers everything needed to configure DGR's full-text evidence layer:
which providers exist, what each one costs, how to obtain credentials, and how to
verify that your setup actually delivers full text.

For the internal architecture (document model, canonicalization, span extraction)
see [src/utils/full-text/README.md](../src/utils/full-text/README.md). This page is
the operator-facing configuration reference.

## Overview

The layer's primitive is **"give me citable evidence spans about the research
target"**, not "give me the PDF". Every provider fills one or more of four stages:

```
resolve   gene anchor / partial identifiers -> CandidateWork (pmid/pmcid/doi/title/preprint flag)
acquire   CandidateWork -> content in the best available format (JATS / BioC / TEI / PDF / snippet)
segment   raw content -> normalized document with canonical text and UTF-16 offsets
extract   document -> EvidenceSpan[] consumed by the report and the CodeXomics evidence manifest
```

The layer runs automatically on every research task: after literature search, DGR
attempts open-access full-text acquisition for up to `fullTextBudget` candidate
works (default 25) and mirrors every provider attempt into the task's
`searchAttempts` log. No configuration is required for the free Tier 1 providers.

## Quick start

**Zero configuration (free, works out of the box):** Europe PMC, PubTator,
bioRxiv/medRxiv and Crossref need nothing at all. Unpaywall is the only Tier 1
provider that requires anything — an email address:

```bash
CROSSREF_MAILTO=you@example.org     # Crossref polite pool
UNPAYWALL_EMAIL=you@example.org     # OA copy locator + PDF fallback
```

**Recommended full setup** adds the two highest-value optional providers:

```bash
NCBI_API_KEY=...                    # PubTator 3/s -> 10/s, shared NCBI budget
OPENALEX_API_KEY=...                # cross-disciplinary full-text fallback
ASTA_API_KEY=...                    # snippet-level evidence of last resort
```

Restart the server after changing `.env.local`; provider configuration is read
from the process environment at request time.

## Environment variables

| Variable              | Required      | Purpose                                                                                                                                                    |
| --------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NCBI_API_KEY`        | optional      | Raises all NCBI-family rate limits (PubTator, ID Converter, BioC-PMC, PMC OA) from 3 to 10 requests/second. `NCBI_EUTILS_API_KEY` is accepted as an alias. |
| `CROSSREF_MAILTO`     | optional      | Email sent as `mailto` on Crossref requests; puts your traffic in the polite pool (more reliable throughput than the shared public pool).                  |
| `UNPAYWALL_EMAIL`     | for Unpaywall | Email passed as the `email` parameter. Without it the Unpaywall provider is disabled entirely.                                                             |
| `ASTA_API_KEY`        | for Asta      | `x-api-key` for the Ai2 Asta MCP endpoint. Free, but issued via a request form (below).                                                                    |
| `OPENALEX_API_KEY`    | for OpenAlex  | Required for content downloads ($0.01 each, $1/day free). Without it the provider abstains.                                                                |
| `CORE_API_KEY`        | for CORE      | Bearer token, free for academic users.                                                                                                                     |
| `FULL_TEXT_PROVIDERS` | optional      | Explicit comma-separated whitelist of provider ids. **Full override** — see the semantics section below.                                                   |

## Obtaining credentials

### NCBI API key (free, instant)

1. Create or sign in to an NCBI account at <https://www.ncbi.nlm.nih.gov/account/>.
2. Open **Account Settings → API Key Management** and generate a key.
3. Set `NCBI_API_KEY`. One key covers PubTator, ID Converter, BioC-PMC and PMC OA.

### Crossref / Unpaywall (no registration)

Both only ask for a contact email so they can reach you before throttling abuse.
No signup, no approval step — set `CROSSREF_MAILTO` and `UNPAYWALL_EMAIL` to any
mailbox you read.

### OpenAlex API key (free, ~1 minute)

1. Create a free account at <https://openalex.org>.
2. Copy the key from <https://openalex.org/settings/api>.
3. Set `OPENALEX_API_KEY`.

Every key gets **$1 of free usage per day, no payment method required**. Work
metadata queries are free and keyless; only content downloads (GROBID TEI / PDF)
are billed at $0.01 each, so the free tier covers ~100 full-text downloads/day.
DGR additionally self-caps at 100 successful downloads per day per process
(`DEFAULT_MAX_DOWNLOADS_PER_DAY` in `providers/openalex.ts`) so a runaway task
cannot exceed the free tier; the counter only increments after a _successful_
download. Watch `X-RateLimit-Remaining-USD` response headers or the usage
dashboard (battery icon on openalex.org) if you run large batches.

### Ai2 Asta API key (free, form request)

1. Open <https://allenai.org/asta/resources/mcp> and follow **Request an API key**
   (a HubSpot form: name, institution, intended use).
2. The key is delivered by email; it may not be instant.
3. Set `ASTA_API_KEY`.

Asta is used as the **no-download last resort**: when every document source fails
for a work, the gene engine calls `snippet_search` (top 3 snippets) so the target
still gets located, quotable evidence. Note the [Asta corpus license
terms](https://allenai.org/asta-corpus-license/2025-08-26).

### CORE API key (free for academics)

Register at <https://core.ac.uk/services/api> with an academic email. CORE's role
(green-OA repository copies) overlaps heavily with OpenAlex; configure it if you
want the extra coverage of institutional repositories, but it is the most
optional entry in this list.

## Provider catalog

### Tier 1 — free, on by default

| Provider        | Role                    | Best format                                                                                  | Auth              | Cost | Rate limit                   |
| --------------- | ----------------------- | -------------------------------------------------------------------------------------------- | ----------------- | ---- | ---------------------------- |
| Europe PMC      | acquisition + discovery | JATS XML full text (+ Annotations API, supplementary files)                                  | none              | free | no hard limit, stay ~8 req/s |
| PubTator 3.0    | acquisition             | BioC JSON, pre-sectioned with entity annotations                                             | optional NCBI key | free | 3 req/s (10 with key)        |
| Crossref        | metadata                | license (`content-version=vor`), text-mining links, **retraction detection** via `update-to` | `mailto` email    | free | polite pool with `mailto`    |
| Unpaywall       | metadata + PDF fallback | DOI → OA copy (`best_oa_location`)                                                           | `email` parameter | free | ~8 req/s                     |
| bioRxiv/medRxiv | discovery + acquisition | JATS/PDF for preprint DOIs                                                                   | none              | free | polite use                   |

### Tier 2 — on when their key is configured

| Provider | Role                 | Auth               | Cost                        | Notes                                                                            |
| -------- | -------------------- | ------------------ | --------------------------- | -------------------------------------------------------------------------------- |
| OpenAlex | acquisition fallback | `OPENALEX_API_KEY` | $0.01/download, $1/day free | GROBID TEI from the content host; the only cross-disciplinary full-text fallback |
| Ai2 Asta | snippet evidence     | `ASTA_API_KEY`     | free                        | MCP-native (`snippet_search`); no document download                              |
| CORE     | acquisition fallback | `CORE_API_KEY`     | free (academics)            | green-OA author manuscripts from 14k+ repositories                               |

### Tier 3 — only via explicit `FULL_TEXT_PROVIDERS` whitelist

| Provider id        | What it adds                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `bioc_pmc`         | PMC OA full text in BioC form without PubTator's annotations                                                          |
| `ncbi_idconv`      | Batch DOI ⇄ PMID ⇄ PMCID backfill during resolve                                                                      |
| `pmc_oa`           | Whole-package tgz locator (figures, supplementary)                                                                    |
| `semantic_scholar` | TLDR/citation enrichment. **Transient use only** — parts of the dataset are CC BY-NC and redistribution is prohibited |
| `arxiv`            | Preprint resolver; not wired into the PubMed waterfall                                                                |

## `FULL_TEXT_PROVIDERS` semantics

The variable is a **full whitelist override**, not an additive list:

- **Unset** → all Tier 1 providers, plus bioRxiv, plus any Tier 2 provider whose
  key is configured. Tier 3 stays off.
- **Set** → exactly the listed ids, in waterfall order. Tier 1 providers you omit
  are turned _off_; Tier 3 providers you name are turned _on_.

Provider ids: `europe_pmc`, `europe_pmc_annotations`, `pubtator`, `crossref`,
`unpaywall`, `asta`, `openalex`, `core`, `biorxiv`, `bioc_pmc`, `ncbi_idconv`,
`pmc_oa`, `semantic_scholar`, `arxiv`.

Key-gated providers (`asta`, `openalex`, `core`) still need their keys even when
whitelisted — the whitelist controls enablement, not credentials, and Unpaywall
still requires `UNPAYWALL_EMAIL`.

Example — everything including the useful Tier 3 sources:

```bash
FULL_TEXT_PROVIDERS=europe_pmc,europe_pmc_annotations,pubtator,crossref,unpaywall,biorxiv,bioc_pmc,ncbi_idconv,pmc_oa,openalex,asta
```

## Runtime parameters

Provider configuration is server-side; per-task behavior is controlled by task
parameters (REST `POST /api/mcp` task creation, or the MCP `deep-gene-research`
tool arguments):

| Parameter          | Range   | Default       | Meaning                                                                        |
| ------------------ | ------- | ------------- | ------------------------------------------------------------------------------ |
| `fullTextBudget`   | 1–100   | 25            | How many candidate works get a full-text acquisition attempt per research task |
| `literatureBudget` | 10–2000 | comprehensive | Total PubMed abstracts retained for synthesis                                  |

Full text is always attempted (minimum budget is 1); there is no "disable" flag.
If a run reports `fullTextSourceCount: 0`, the waterfall ran but found no
open-access copy for any candidate — that is a coverage outcome, not a
configuration issue.

## Acquisition waterfall

```
Europe PMC JATS -> PubTator BioC -> [bioc_pmc] -> bioRxiv PDF (preprints)
-> OpenAlex TEI -> CORE PDF -> Unpaywall PDF
```

- First success wins; every step records an attempt (`success` / `empty` /
  `error` with duration) that surfaces in the task's `searchAttempts`.
- Europe PMC Annotations runs as enrichment (located entity mentions) alongside
  the content path, not as a competitor.
- Crossref runs as metadata enrichment on every work: a `retraction` entry in
  `update-to` excludes the work from evidence (`evidenceRole: 'excluded'`).
- When all document sources fail and `ASTA_API_KEY` is set, the gene engine calls
  Asta `snippet_search` (top 3) as the last resort.
- PDF downloads go through the SSRF-hardened fetcher (`fetchPublicBytes`):
  DNS-pinned, redirect targets re-validated per hop, `%PDF-` magic checked,
  30 MB cap.

## Costs & rate limits summary

| Provider        | Cost model                              | DGR-side throttle                                     |
| --------------- | --------------------------------------- | ----------------------------------------------------- |
| Europe PMC      | free                                    | polite fetcher, serialized per provider               |
| PubTator        | free                                    | 3 req/s (10 with `NCBI_API_KEY`), Retry-After honored |
| Crossref        | free                                    | polite pool with `CROSSREF_MAILTO`                    |
| Unpaywall       | free                                    | polite fetcher                                        |
| bioRxiv/medRxiv | free                                    | polite fetcher                                        |
| OpenAlex        | $0.01 per content download; $1/day free | self-cap 100 successful downloads/day/process         |
| Asta            | free                                    | snippet fallback only (≤3 snippets per failed work)   |
| CORE            | free tier                               | polite fetcher                                        |

## Verifying your setup

1. Restart the server after editing `.env.local`.
2. Run any research task and inspect the result's `searchAttempts` — each
   provider attempt is logged with status and duration. A healthy run shows
   `europe_pmc:success` (or a later waterfall step) plus
   `fullTextSourceCount > 0` in the metadata.

Common symptoms:

| Symptom                                                       | Likely cause                                                                                                                                        |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unpaywall` never appears in attempts                         | `UNPAYWALL_EMAIL` unset — the provider disables itself                                                                                              |
| `openalex` always `empty`                                     | key missing/invalid, or the work has no OpenAlex content copy; also abstains after 100 successful downloads/day                                     |
| PubTator attempts `error` with HTTP 429                       | shared 3 req/s budget exhausted — set `NCBI_API_KEY`                                                                                                |
| `asta` never fires                                            | it only runs when every document source failed for a work, and needs `ASTA_API_KEY`                                                                 |
| `Private-network URLs are not allowed` on every guarded fetch | a fake-ip local proxy (Clash/Surge) answers DNS from 198.18.0.0/15; current releases allow that range because it is unroutable without such a proxy |
