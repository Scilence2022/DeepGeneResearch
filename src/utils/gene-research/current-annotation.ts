import type { CurrentAnnotationSnapshot } from '@/contracts/annotation-change-set';

export type MutableAnnotationField = keyof CurrentAnnotationSnapshot;

const PLACEHOLDER_PRODUCT = /^(?:(?:conserved\s+)?hypothetical|uncharacteri[sz]ed|unknown|predicted|putative)(?:\s+(?:protein|gene\s+product))?$|^protein\s+(?:of\s+)?unknown\s+function$|^(?:protein|enzyme|gene\s+product)$/i;
const NON_SPECIFIC_PRODUCT_TOKENS = new Set([
  'a',
  'an',
  'conserved',
  'family',
  'gene',
  'hypothetical',
  'of',
  'predicted',
  'probable',
  'product',
  'protein',
  'putative',
  'unknown',
  'uncharacterized',
]);

const ANNOTATION_TO_SNAPSHOT_FIELD: Record<string, MutableAnnotationField> = {
  product: 'product',
  ecNumbers: 'EC_number',
  goTerms: 'go_terms',
  koTerms: 'ko',
  pathwayTerms: 'pathway',
  dbXrefs: 'db_xref',
};

export interface ExactFieldEvidenceEntry {
  value: string;
  sourceId: string;
  database: string;
  url: string;
  retrievedAt: string;
  currentValue?: string;
  justification?: string;
}

export type ExactAnnotationFieldEvidence = Record<string, ExactFieldEvidenceEntry[]>;

export function normalizeAnnotationQualifierValue(
  field: MutableAnnotationField,
  value: unknown,
): string {
  let normalized = String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (!normalized) return '';
  if (field === 'EC_number') normalized = normalized.replace(/^ec\s*[:=]?\s*/i, '');
  if (field === 'go_terms') normalized = normalized.replace(/^go\s*[:=]?\s*/i, '');
  if (field === 'ko') normalized = normalized.replace(/^(?:kegg\s+orthology|ko)\s*[:=]?\s*/i, '');
  if (field === 'pathway') normalized = normalized.replace(/^(?:kegg(?:\s+pathway)?|pathway)\s*[:=]?\s*/i, '');
  return normalized.replace(/\s*:\s*/g, ':');
}

function productTokens(value: string): string[] {
  return normalizeAnnotationQualifierValue('product', value)
    .split(/[^a-z0-9]+/)
    .filter(token => token && !NON_SPECIFIC_PRODUCT_TOKENS.has(token));
}

export function isPlaceholderProduct(value: unknown): boolean {
  const normalized = normalizeAnnotationQualifierValue('product', value);
  return !normalized || PLACEHOLDER_PRODUCT.test(normalized);
}

/**
 * Product replacement is intentionally asymmetric: an exact source may
 * refine a placeholder/generic product or add lexical specificity, but it may
 * not exchange one already-specific annotation for a different name.
 */
export function isMoreSpecificProduct(candidate: unknown, current: unknown): boolean {
  const candidateValue = normalizeAnnotationQualifierValue('product', candidate);
  const currentValue = normalizeAnnotationQualifierValue('product', current);
  if (!candidateValue || !currentValue || candidateValue === currentValue || isPlaceholderProduct(candidateValue)) {
    return false;
  }

  const candidateTokens = productTokens(candidateValue);
  if (candidateTokens.length === 0) return false;
  if (isPlaceholderProduct(currentValue)) return true;

  const currentTokens = productTokens(currentValue);
  if (currentTokens.length === 0 || candidateTokens.length <= currentTokens.length) return false;
  const candidateTokenSet = new Set(candidateTokens);
  return currentTokens.every(token => candidateTokenSet.has(token));
}

export function currentAnnotationHasValue(
  snapshot: CurrentAnnotationSnapshot | undefined,
  field: MutableAnnotationField,
  candidate: unknown,
): boolean {
  if (!snapshot) return false;
  const current = field === 'product'
    ? [snapshot.product]
    : Array.isArray(snapshot[field])
      ? snapshot[field] as string[]
      : [];
  const normalizedCandidate = normalizeAnnotationQualifierValue(field, candidate);
  return Boolean(normalizedCandidate) && current.some(value =>
    normalizeAnnotationQualifierValue(field, value) === normalizedCandidate
  );
}

export function buildExactAnnotationFieldEvidence({
  annotation,
  currentAnnotation,
  sourceId,
  database,
  url,
  retrievedAt,
}: {
  annotation: Record<string, unknown> | undefined;
  currentAnnotation: CurrentAnnotationSnapshot | undefined;
  sourceId: string;
  database: string;
  url: string;
  retrievedAt: string;
}): ExactAnnotationFieldEvidence | undefined {
  if (!annotation) return undefined;
  const fieldEvidence: ExactAnnotationFieldEvidence = {};

  for (const [annotationKey, snapshotField] of Object.entries(ANNOTATION_TO_SNAPSHOT_FIELD)) {
    const rawValue = annotation[annotationKey];
    if (rawValue === undefined || rawValue === null || rawValue === '') continue;
    const values = (Array.isArray(rawValue) ? rawValue : [rawValue])
      .map(value => String(value).trim())
      .filter(Boolean);

    const entries = values.flatMap(value => {
      if (snapshotField === 'product') {
        const currentProduct = String(currentAnnotation?.product || '').trim();
        if (!isMoreSpecificProduct(value, currentProduct)) return [];
        return [{
          value,
          sourceId,
          database,
          url,
          retrievedAt,
          currentValue: currentProduct,
          justification: 'Exact-target authoritative evidence provides a more specific annotation product than the current placeholder or generic product.',
        }];
      }
      return [{ value, sourceId, database, url, retrievedAt }];
    });
    if (entries.length > 0) fieldEvidence[annotationKey] = entries;
  }

  return Object.keys(fieldEvidence).length > 0 ? fieldEvidence : undefined;
}
