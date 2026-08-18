import { createPoliteFetcher, type PoliteFetcher } from '../http';

const PMC_OA_BASE = 'https://www.ncbi.nlm.nih.gov/pmc/utils/oa/oa.fcgi';

// Module-level lazy fetcher so the 3 req/s NCBI courtesy limit is enforced
// across calls.
let fetcher: PoliteFetcher | null = null;

function pmcOaFetcher(): PoliteFetcher {
  fetcher ??= createPoliteFetcher({ provider: 'pmc_oa', requestsPerSecond: 3 });
  return fetcher;
}

function is404(error: unknown): boolean {
  return /404\b/.test(error instanceof Error ? error.message : String(error));
}

export interface PmcOaPackageLocation {
  tgzUrl: string;
  license?: string;
}

/**
 * locator helper: PMCID -> PMC OA Web Service whole-package tgz location
 * (figures, supplementary files, ...). The response is small XML, parsed with
 * regex since this repo carries no XML library. `ftp://` hrefs are rewritten
 * to `https://` (same host/path) because the fetch layer is HTTP-only. This
 * only records the location; the archive itself is never downloaded.
 * Returns null when the record is not in the PMC OA subset (`<error>`).
 */
export async function locatePmcOaPackage(pmcid: string): Promise<PmcOaPackageLocation | null> {
  const normalized = String(pmcid || '').trim().toUpperCase();
  if (!/^PMC\d+$/.test(normalized)) return null;
  const sourceUrl = `${PMC_OA_BASE}?id=${encodeURIComponent(normalized)}`;
  let xml: string;
  try {
    xml = await pmcOaFetcher().fetchText(sourceUrl);
  } catch (error) {
    if (is404(error)) return null;
    throw error;
  }
  if (/<error[\s>]/i.test(xml)) return null;
  const linkMatch = xml.match(/<link\b[^>]*\bformat="tgz"[^>]*\bhref="([^"]+)"/i)
    || xml.match(/<link\b[^>]*\bhref="([^"]+)"[^>]*\bformat="tgz"/i);
  const href = linkMatch?.[1];
  if (!href) return null;
  const tgzUrl = href.replace(/^ftp:\/\//i, 'https://');
  const licenseMatch = xml.match(/<record\b[^>]*\blicense="([^"]+)"/i);
  return {
    tgzUrl,
    ...(licenseMatch?.[1] ? { license: licenseMatch[1] } : {}),
  };
}
