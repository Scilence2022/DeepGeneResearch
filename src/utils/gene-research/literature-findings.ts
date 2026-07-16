import { createHash } from 'crypto';

export type LiteratureFindingCategory =
  | 'identity'
  | 'function'
  | 'structure'
  | 'pathway'
  | 'regulation'
  | 'expression'
  | 'interaction'
  | 'phenotype';

export interface CitationBoundLiteratureFinding {
  category: LiteratureFindingCategory;
  /** Verbatim abstract sentence(s); no model-authored biological inference. */
  statement: string;
  evidenceSentence: string;
  title: string;
  pmid: string;
  doi?: string;
  year?: number;
  url: string;
  abstractSha256: string;
  abstractLength: number;
  excerptStart: number;
  excerptEnd: number;
  canonicalization: typeof PUBMED_ABSTRACT_CANONICALIZATION;
  offsetEncoding: typeof PUBMED_ABSTRACT_OFFSET_ENCODING;
  source: Record<string, any>;
}

interface LiteratureFindingTarget {
  geneSymbol: string;
  organism: string;
  locusTag?: string | null;
  proteinId?: string | null;
  identityTerms?: string[];
}

const CATEGORY_PATTERNS: Array<[LiteratureFindingCategory, RegExp]> = [
  ['regulation', /\b(?:alloster\w*|attenuat\w*|cis[-\s]?dominance|feedback|induc\w*|inhibit\w*|operators?(?:-type)?|promoters?|regulat\w*|regulons?|repress\w*|riboswitch\w*|transcription\w*)\b/i],
  ['structure', /\b(?:active\s+site|conformation\w*|crystal\w*|domain\w*|residues?|(?!structural\s+genes?\b)structur\w*)\b/i],
  ['pathway', /\b(?:biosynth\w*|metabolic\w*|pathways?|flux)\b/i],
  ['phenotype', /\b(?:auxotroph\w*|delet\w*|growth|knockout\w*|mutants?|phenotyp\w*|resistan\w*)\b/i],
  ['expression', /\b(?:abundan\w*|express\w*|mrna|transcripts?|translation\w*)\b/i],
  ['interaction', /\b(?:bind\w*|complex\w*|interact\w*|partner\w*)\b/i],
  ['identity', /\b(?:clon\w*|coding\s+sequence|encod\w*|genes?|locus|nucleotide\s+sequence|sequence\s+determined)\b/i],
  ['function', /\b(?:activity|affinity|cataly\w*|convert\w*|encod\w*|enzyme\w*|function\w*|kinetic\w*|phosphorylat\w*|substrates?)\b/i],
];

const RESULT_PATTERN = /\b(?:activat\w*|affect\w*|bind\w*|cataly\w*|caus\w*|control\w*|convert\w*|decreas\w*|demonstrat\w*|determin\w*|encod\w*|enhanc\w*|establish\w*|feedback|find|found|identif\w*|increas\w*|indicat\w*|inhibit\w*|involv\w*|lead\w*|observ\w*|phosphorylat\w*|reduc\w*|regulat\w*|repress\w*|requir\w*|responsible|result\w*|reveal\w*|show|shown|shows|suggest\w*)\b/i;
const NON_RESULT_LEAD = /^(?:background|context|objective|purpose)\s*:?\s*/i;
const HARD_COLLISION = /\blysozyme\s*c(?:-?\d+)?\b|\b(?:lys[-\s]?c|lysyl\s+endopeptidase)\b[^.]{0,90}\b(?:digest\w*|proteas\w*|proteolysis|sample\s+processing)\b|\b(?:bacteriophages?|phages?)\b[^.]{0,120}\b(?:lysis|lytic|lysc)\b/i;

/**
 * Canonicalization shared by DGR proposal generation and downstream archive
 * verification. Offsets use JavaScript string indexes (UTF-16 code units).
 */
export const PUBMED_ABSTRACT_CANONICALIZATION = 'dgr.pubmed-abstract.v1' as const;
export const PUBMED_ABSTRACT_OFFSET_ENCODING = 'utf16_code_units' as const;

export function canonicalizePubMedAbstract(value: unknown): string {
  return String(value || '')
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/gu, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsIdentity(text: string, term: string): boolean {
  const normalized = String(term || '').trim();
  if (normalized.length < 3) return false;
  return new RegExp(`(^|[^A-Za-z0-9])${escapeRegExp(normalized)}(?=$|[^A-Za-z0-9])`, 'i').test(text);
}

interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

function splitSentenceSpans(value: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let start = 0;
  const boundary = /[.!?](?=\s+[A-Z0-9(]|$)/g;
  for (const match of value.matchAll(boundary)) {
    const end = (match.index || 0) + match[0].length;
    if (end > start) spans.push({ text: value.slice(start, end), start, end });
    start = end;
    while (value[start] === ' ') start += 1;
  }
  if (start < value.length) spans.push({ text: value.slice(start), start, end: value.length });
  return spans.filter(span => span.text.length > 0);
}

function sourceReference(source: Record<string, any>) {
  return source?.structuredData?.literatureReferences?.[0] || {};
}

function targetIdentityTerms(target: LiteratureFindingTarget): string[] {
  return Array.from(new Set([
    target.geneSymbol,
    target.locusTag,
    target.proteinId,
    ...(target.identityTerms || []),
  ]
    .map(value => String(value || '').trim())
    .filter(value => value.length >= 3)
    .filter(value => !/^(?:enzyme|gene|protein|unknown)$/i.test(value))));
}

function sentenceHasTarget(sentence: string, terms: string[]): boolean {
  return terms.some(term => containsIdentity(sentence, term));
}

function classifyFinding(sentence: string): LiteratureFindingCategory | null {
  return CATEGORY_PATTERNS.find(([, pattern]) => pattern.test(sentence))?.[0] || null;
}

/**
 * Extract citation-bound findings from direct, exact-target PubMed abstracts.
 *
 * This deliberately performs selection, not free-form summarization: the
 * emitted statement is copied from the PubMed abstract and remains bound to
 * one PMID/DOI. NCBI Gene-linked-only context, titles without abstracts, and
 * reagent/homonym/phage collisions can expand provenance but cannot become a
 * biological assertion.
 */
export function extractCitationBoundLiteratureFindings(
  sources: Array<Record<string, any>>,
  target: LiteratureFindingTarget,
  maxFindings = 18,
): CitationBoundLiteratureFinding[] {
  const terms = targetIdentityTerms(target);
  const findings: CitationBoundLiteratureFinding[] = [];
  const seenStatements = new Set<string>();

  for (const source of sources || []) {
    if (findings.length >= maxFindings) break;
    if (String(source?.database || '').toLowerCase() !== 'pubmed') continue;
    const relevance = source?.structuredData?.targetRelevance;
    if (relevance?.accepted !== true || relevance?.directness !== 'direct') continue;

    const reference = sourceReference(source);
    const pmid = String(reference.pmid || source?.provenance?.recordId || '').trim();
    const abstract = canonicalizePubMedAbstract(reference.abstract);
    if (!/^\d{6,10}$/.test(pmid) || abstract.length < 40 || HARD_COLLISION.test(`${source.title || ''} ${abstract}`)) {
      continue;
    }

    const sentences = splitSentenceSpans(abstract);
    const targetIndexes = new Set(
      sentences.flatMap((sentence, index) => sentenceHasTarget(sentence.text, terms) ? [index] : [])
    );
    const usedCategories = new Set<LiteratureFindingCategory>();
    let sourceFindingCount = 0;

    for (let index = 0; index < sentences.length; index += 1) {
      if (findings.length >= maxFindings || sourceFindingCount >= 2) break;
      const sentence = sentences[index];
      if (NON_RESULT_LEAD.test(sentence.text) || !RESULT_PATTERN.test(sentence.text)) continue;
      const category = classifyFinding(sentence.text);
      if (!category || usedCategories.has(category)) continue;

      const contextIndex = targetIndexes.has(index)
        ? index
        : targetIndexes.has(index - 1)
          ? index - 1
          : -1;
      if (contextIndex < 0) continue;

      const statementStart = sentences[contextIndex].start;
      const statementEnd = sentence.end;
      const evidenceSentence = abstract.slice(sentence.start, sentence.end);
      const statement = abstract.slice(statementStart, statementEnd);
      // Keep curator-facing facts concise without ever truncating or otherwise
      // changing the verbatim span that the hashes and offsets authenticate.
      if (evidenceSentence.length > 900 || statement.length > 900) continue;
      const key = statement.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!key || seenStatements.has(key)) continue;

      const numericYear = Number(reference.year);
      seenStatements.add(key);
      usedCategories.add(category);
      sourceFindingCount += 1;
      findings.push({
        category,
        statement,
        evidenceSentence,
        title: String(source.title || reference.title || `PubMed article ${pmid}`),
        pmid,
        doi: reference.doi ? String(reference.doi) : undefined,
        year: Number.isInteger(numericYear) && numericYear > 0 ? numericYear : undefined,
        url: String(source.url || `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`),
        abstractSha256: createHash('sha256').update(abstract).digest('hex'),
        abstractLength: abstract.length,
        // The externally authenticated excerpt is the complete curator-facing
        // statement, including an immediately preceding target-identity
        // sentence when that context is required.
        excerptStart: statementStart,
        excerptEnd: statementEnd,
        canonicalization: PUBMED_ABSTRACT_CANONICALIZATION,
        offsetEncoding: PUBMED_ABSTRACT_OFFSET_ENCODING,
        source,
      });
    }
  }

  return findings;
}
