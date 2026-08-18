# DGR full-text evidence layer

The layer's primitive is **"give me citable evidence spans about the research
target"**, not "give me the PDF". Downstream consumers are LLMs and the
CodeXomics evidence manifest, both of which need quotable, re-locatable spans
with hashes and UTF-16 offsets — and the cheapest path to a span often never
downloads a document at all (Europe PMC Annotations, PubTator BioC, Ai2 Asta
snippets all return located passages directly).

Every provider fills one or more of four stages:

```
resolve   gene anchor / partial identifiers -> CandidateWork (pmid/pmcid/doi/title/preprint flag)
acquire   CandidateWork -> AcquiredContent (best available format)
segment   raw content -> FullTextDocument with canonical text + offsets
extract   FullTextDocument -> FullTextEvidenceSpan[] (owned by gene-research/full-text.ts)
```

All documents and spans keep the `dgr.full-text.v1` canonicalization so
`EvidenceRecord.sourceBinding` verification in CodeXomics stays intact.

## Layout

- `types.ts` — `CandidateWork`, `AcquiredContent`, `WorkMetadata`,
  `ProviderAnnotation`, attempt logging shapes.
- `http.ts` — `createPoliteFetcher`: per-provider rate limit, Retry-After,
  exponential backoff. Every provider client uses it.
- `pipeline.ts` — `acquireFullTextEvidence(anchor, options, env)`: resolve,
  metadata enrichment, acquisition waterfall, Europe PMC annotation
  enrichment. `resolveEnabledProviders` implements the default enablement and
  the `FULL_TEXT_PROVIDERS` whitelist. `acquirePdfFromUrl` downloads OA PDF
  copies via the SSRF-hardened `fetchPublicBytes` and validates `%PDF-` magic.
- `segment/` — format normalizers: `bioc.ts` (BioC JSON), `tei.ts` (GROBID
  TEI), `pdf.ts` (pdfjs, shared with user-uploaded PDFs).

## Providers

Tier 1 (free, on by default): Europe PMC (JATS + Annotations + supplementary
locator), PubTator 3.0 (BioC, pre-sectioned and entity-annotated), Crossref
(license, text-mining links, retraction via `update-to`), Unpaywall (OA
locator; requires `UNPAYWALL_EMAIL`).

Tier 2 (on when configured): Ai2 Asta (`ASTA_API_KEY`, MCP `snippet_search`
— used by the gene engine as the no-download last resort), OpenAlex
(`OPENALEX_API_KEY`, GROBID TEI from `content.openalex.org/works/{id}.grobid-xml`,
paid $0.01/download with a daily cap of 100), CORE (`CORE_API_KEY`, green-OA
repository copies), bioRxiv/medRxiv (no key; preprint DOIs only).

Tier 3 (whitelist-only via `FULL_TEXT_PROVIDERS`): BioC-PMC, NCBI ID
Converter (identifier backfill), PMC OA service (whole-package tgz locator),
Semantic Scholar (TLDR/citation enrichment — transient use only, parts of the
dataset are CC BY-NC), arXiv (preprint resolver, not wired into the PubMed
waterfall).

## Waterfall order

```
Europe PMC JATS -> PubTator BioC -> [bioc_pmc] -> bioRxiv PDF (preprints)
-> OpenAlex TEI -> CORE PDF -> Unpaywall PDF
```

First success wins; every step records an attempt (`success` / `empty` /
`error`) that the gene engine mirrors into `searchAttempts`. Crossref
retractions exclude the work from evidence (`evidenceRole: 'excluded'`).

## Configuration

See `env.tpl`: `NCBI_API_KEY`, `CROSSREF_MAILTO`, `UNPAYWALL_EMAIL`,
`ASTA_API_KEY`, `OPENALEX_API_KEY`, `CORE_API_KEY`, `FULL_TEXT_PROVIDERS`.
