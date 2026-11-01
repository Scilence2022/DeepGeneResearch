/** Recognized pathway record IDs, never gene or protein cross-reference IDs. */
export function isPathwayIdentifier(value: string, organism?: string | null): boolean {
  const clean = value.trim();
  if (/^KEGG:(?:path:)?[a-z]{2,4}\d{5}$/.test(clean)) return true;
  // BioCyc protein IDs (including MONOMER, PD and complex IDs) cannot be
  // inferred to be pathways. Only explicitly named pathway ID conventions
  // are eligible for automatic qualifier proposals.
  if (/^BioCyc:[A-Za-z0-9_-]+:(?:PWY[0-9A-Z-]*|[A-Z0-9-]+-PWY)$/.test(clean)) return true;
  const reactome = clean.match(/^Reactome:R-([A-Z]{3})-\d+$/);
  if (!reactome) return false;
  const species = String(organism || '').trim().toLowerCase();
  const supportedSpecies: Record<string, string> = {
    'homo sapiens': 'HSA',
    'mus musculus': 'MMU',
    'rattus norvegicus': 'RNO',
    'danio rerio': 'DRE',
    'drosophila melanogaster': 'DME',
    'caenorhabditis elegans': 'CEL',
    'saccharomyces cerevisiae': 'SCE',
    'bos taurus': 'BTA',
    'sus scrofa': 'SSC',
    'xenopus tropicalis': 'XTR',
  };
  return Object.entries(supportedSpecies).some(([name, code]) =>
    (species === name || species.startsWith(`${name} (`)) && reactome[1] === code
  );
}
