type WorkIdentifiers = { pmid?: unknown; pmcid?: unknown; doi?: unknown };

/** Compare identifiers from independent records. A conflict overrides a match. */
export function compareWorkIdentity(left: WorkIdentifiers, right: WorkIdentifiers) {
  let matched = false;
  for (const scheme of ['pmid', 'pmcid', 'doi'] as const) {
    const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase()
      .replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '');
    const first = normalize(left[scheme]);
    const second = normalize(right[scheme]);
    if (!first || !second) continue;
    if (first !== second) return 'conflict';
    matched = true;
  }
  return matched ? 'match' : 'unverified';
}

export function workIdentifiers(source: {
  pmid?: unknown;
  pmcid?: unknown;
  doi?: unknown;
  provenance?: { provider?: unknown; recordId?: unknown };
  structuredData?: { literatureReferences?: WorkIdentifiers[] };
}): WorkIdentifiers {
  const reference = source.structuredData?.literatureReferences?.[0];
  return {
    pmid: source.pmid || reference?.pmid
      || (source.provenance?.provider === 'pubmed' ? source.provenance.recordId : undefined),
    pmcid: source.pmcid || reference?.pmcid,
    doi: source.doi || reference?.doi,
  };
}
