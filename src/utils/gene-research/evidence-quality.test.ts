import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildAnnotationCurationSummary } from './codexomics-annotation';
import { buildReviewEvidence } from './review-evidence';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const excerpt = 'Deletion of lysC reduced growth under lysine limitation in Escherichia coli.';
const prefix = 'Cultures were prepared in defined medium under controlled conditions. '.repeat(4);
const text = prefix + excerpt;
const pmid = '10000001';
const doi = '10.5555/dgr-synthetic-case';
const target = {
  workspaceId: 'test', genomeId: 'test', annotationRevision: 1, featureId: 'b4024',
  featureHash: 'test', chromosome: 'NC_000913.3', featureType: 'CDS',
  locusTag: 'b4024', geneSymbol: 'lysC', organism: 'Escherichia coli',
};

function source(kind: 'public' | 'conflict' | 'retracted' | 'doi-only' | 'private' | 'snippet' | 'forged-span') {
  const privateUpload = kind === 'private';
  const parentPmid = privateUpload || kind === 'doi-only' ? undefined : pmid;
  const textSha256 = digest(text);
  return {
    title: 'Synthetic aspartokinase study',
    url: privateUpload ? `urn:sha256:${digest('private file')}` : `https://doi.org/${doi}`,
    database: privateUpload ? 'user_document' : 'pubmed',
    targetMatch: true,
    pmid: parentPmid,
    doi: privateUpload ? undefined : doi,
    structuredData: { targetRelevance: { accepted: true, directness: 'direct' }, retracted: kind === 'retracted' },
    fullText: {
      schema: 'dgr.full-text-document.v1',
      origin: privateUpload ? 'user_upload' : kind === 'snippet' ? 'snippet' : 'pdf',
      identifiers: { doi, pmid: kind === 'conflict' ? '20000002' : parentPmid },
      documentSha256: digest('private file'),
      text,
      textSha256,
      textLength: text.length,
      canonicalization: 'dgr.full-text.v1',
      offsetEncoding: 'utf16_code_units',
      pages: [{ pageNumber: 1, start: 0, end: text.length, textSha256 }],
    },
    fullTextEvidence: [{
      kind: 'full_text_span', category: 'phenotype', excerpt,
      excerptStart: prefix.length, excerptEnd: text.length, pageNumber: 1,
      excerptSha256: digest(kind === 'forged-span' ? 'forged' : excerpt), textSha256,
      textLength: text.length, canonicalization: 'dgr.full-text.v1', offsetEncoding: 'utf16_code_units',
    }],
  };
}

describe('evidence benchmark v1 (synthetic reference labels)', () => {
  it.each([
    ['public', true, false],
    ['conflict', false, false],
    ['retracted', false, false],
    ['doi-only', false, true],
    ['private', false, true],
    ['snippet', false, false],
    ['forged-span', false, false],
  ] as const)('assigns the expected eligibility and work citation for %s', (kind, mutationEligible, reviewOnly) => {
    const input = source(kind);
    const result = buildAnnotationCurationSummary({ ...target, target, sources: [input] });
    const facts = result.researchSummary.facts.filter(fact => fact.literatureBasis?.kind === 'full_text_span');
    expect(facts.map(fact => [fact.statement, fact.citation?.id])).toEqual(mutationEligible ? [[excerpt, pmid]] : []);
    const review = buildReviewEvidence([input]);
    expect(review.excerpts.map(item => [item.excerpt, item.locator.scheme, item.pageNumber]))
      .toEqual(reviewOnly ? [[excerpt, kind === 'private' ? 'sha256' : 'doi', 1]] : []);
  });
});
