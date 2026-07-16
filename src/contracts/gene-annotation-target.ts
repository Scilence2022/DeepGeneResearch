export const SUPPORTED_GENE_ANNOTATION_FEATURE_TYPES = [
  'CDS',
  'gene',
  'mRNA',
  'tRNA',
  'rRNA',
  'ncRNA',
  'tmRNA',
  'misc_RNA',
  'precursor_RNA',
  'miRNA',
  'snRNA',
  'snoRNA',
  'antisense_RNA',
  'guide_RNA',
  'telomerase_RNA',
  'RNase_P_RNA',
  'RNase_MRP_RNA',
  'pseudogene',
] as const;

const SUPPORTED_TYPES = new Set<string>(
  SUPPORTED_GENE_ANNOTATION_FEATURE_TYPES.map(type => type.toUpperCase()),
);

export function isSupportedGeneAnnotationFeatureType(value: unknown): boolean {
  return SUPPORTED_TYPES.has(String(value || '').trim().toUpperCase());
}

export function isProteinCodingFeatureType(value: unknown): boolean {
  return String(value || '').trim().toUpperCase() === 'CDS';
}

export function hasStableGeneResearchIdentity(target: {
  locusTag?: string | null;
  proteinId?: string | null;
  geneSymbol?: string | null;
}): boolean {
  return Boolean(
    String(target.locusTag || '').trim()
      || String(target.proteinId || '').trim()
      || String(target.geneSymbol || '').trim(),
  );
}
