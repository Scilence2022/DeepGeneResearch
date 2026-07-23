import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  buildFullTextEvidenceSpans,
  canonicalizeFullText,
  FULL_TEXT_CANONICALIZATION,
  FULL_TEXT_OFFSET_ENCODING,
  type FullTextDocument,
} from './full-text';

function documentFromText(text: string): FullTextDocument {
  return {
    schema: 'dgr.full-text-document.v1',
    origin: 'user_upload',
    name: 'lysC-study.pdf',
    mediaType: 'application/pdf',
    documentSha256: createHash('sha256').update('pdf-bytes').digest('hex'),
    text,
    textSha256: createHash('sha256').update(text).digest('hex'),
    textLength: text.length,
    canonicalization: FULL_TEXT_CANONICALIZATION,
    offsetEncoding: FULL_TEXT_OFFSET_ENCODING,
    pageCount: 2,
    parsedPageCount: 2,
    parseCoverage: 1,
    pages: [
      { pageNumber: 1, start: 0, end: 80, textSha256: 'a'.repeat(64) },
      { pageNumber: 2, start: 81, end: text.length, textSha256: 'b'.repeat(64) },
    ],
    identifiers: { pmid: '28751' },
    retrievedAt: '2026-07-23T00:00:00.000Z',
    parser: 'test',
  };
}

describe('full-text evidence extraction', () => {
  it('canonicalizes line endings and Unicode before hashing or offsets', () => {
    expect(canonicalizeFullText('  cafe\u0301\r\n\tlysC   result  \n\n\n next ')).toBe(
      'café\nlysC result\n\nnext'
    );
  });

  it('copies exact target-bearing findings with verifiable offsets, hashes, and pages', () => {
    const text = [
      'The Escherichia coli lysC gene encodes lysine-sensitive aspartokinase III.',
      'Biochemical assays showed that lysine inhibits LysC activity in vivo.',
      'Deletion of lysC reduced growth under the tested condition.',
    ].join(' ');
    const document = documentFromText(text);
    const findings = buildFullTextEvidenceSpans(document, {
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      locusTag: 'b4024',
      proteinId: 'NP_418448.1',
    });

    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(text.slice(finding.excerptStart, finding.excerptEnd)).toBe(finding.excerpt);
      expect(finding.excerptSha256).toBe(createHash('sha256').update(finding.excerpt).digest('hex'));
      expect(finding.textSha256).toBe(document.textSha256);
      expect(finding.canonicalization).toBe('dgr.full-text.v1');
      expect(finding.offsetEncoding).toBe('utf16_code_units');
    }
    expect(findings[0].pageNumber).toBe(1);
  });

  it('does not promote explicit LysC protease or phage name collisions', () => {
    const protease = documentFromText(
      'Escherichia coli samples were digested with LysC protease. LysC digestion increased peptide identification.'
    );
    const phage = documentFromText(
      'A bacteriophage lysC lysis cassette was tested in Escherichia coli. The phage lysC gene caused host lysis.'
    );
    const target = { geneSymbol: 'lysC', organism: 'Escherichia coli' };

    expect(buildFullTextEvidenceSpans(protease, target)).toEqual([]);
    expect(buildFullTextEvidenceSpans(phage, target)).toEqual([]);
  });

  it('rejects a local reagent sentence without discarding later exact gene evidence', () => {
    const text = [
      'Proteomic samples were processed by LysC digestion before mass spectrometry.',
      'The Escherichia coli lysC gene was then tested genetically.',
      'Deletion of lysC reduced growth during lysine limitation.',
    ].join(' ');
    const findings = buildFullTextEvidenceSpans(documentFromText(text), {
      geneSymbol: 'lysC',
      organism: 'Escherichia coli',
      locusTag: 'b4024',
    });

    expect(findings).toEqual([
      expect.objectContaining({ category: 'phenotype', excerpt: expect.stringContaining('Deletion of lysC') }),
    ]);
    expect(findings[0].excerpt).not.toContain('LysC digestion');
  });
});
