import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { canonicalizeFullText, MAX_FULL_TEXT_CHARACTERS } from '@/utils/gene-research/full-text';
import { segmentBiocDocument } from './bioc';

function padding(length: number): string {
  return 'The dapA gene encodes dihydrodipicolinate synthase in Escherichia coli. '.repeat(Math.ceil(length / 74)).slice(0, length);
}

function biocFixture() {
  return [
    {
      id: '12345678',
      passages: [
        {
          infons: { section_type: 'TITLE', type: 'title' },
          text: padding(120),
          annotations: [],
        },
        {
          infons: { section_type: 'ABSTRACT', type: 'abstract' },
          text: padding(220),
          annotations: [
            {
              text: 'dapA',
              infons: { type: 'Gene', identifier: '938036' },
              locations: [{ offset: 4, length: 4 }],
            },
            {
              text: 'Escherichia coli',
              infons: { type: 'Species', identifier: '562' },
              locations: [{ offset: 60, length: 16 }],
            },
          ],
        },
      ],
    },
  ];
}

describe('segmentBiocDocument', () => {
  it('joins canonicalized passage texts and preserves identifiers', () => {
    const payload = biocFixture();
    const result = segmentBiocDocument(payload, { pmid: '12345678', pmcid: 'PMC123', doi: '10.1/x' });
    expect(result).not.toBeNull();
    const { document } = result!;
    const expectedText = [canonicalizeFullText(padding(120)), canonicalizeFullText(padding(220))].join('\n\n');
    expect(document.text).toBe(expectedText);
    expect(document.textLength).toBe(expectedText.length);
    expect(document.origin).toBe('bioc');
    expect(document.mediaType).toBe('application/json');
    expect(document.parser).toBe('pubtator-bioc');
    expect(document.canonicalization).toBe('dgr.full-text.v1');
    expect(document.offsetEncoding).toBe('utf16_code_units');
    expect(document.documentSha256).toBe(createHash('sha256').update(JSON.stringify(payload)).digest('hex'));
    expect(document.identifiers).toEqual({ pmid: '12345678', pmcid: 'PMC123', doi: '10.1/x' });
    expect(document.pageCount).toBeNull();
    expect(document.parseCoverage).toBe(1);
  });

  it('emits provider annotations with the -1 offset convention', () => {
    const result = segmentBiocDocument(biocFixture(), { pmid: '12345678' });
    expect(result!.annotations).toEqual([
      { type: 'Gene', identifier: '938036', mention: 'dapA', start: -1, end: -1 },
      { type: 'Species', identifier: '562', mention: 'Escherichia coli', start: -1, end: -1 },
    ]);
  });

  it('returns null when no passage yields usable text', () => {
    expect(segmentBiocDocument([{ passages: [{ text: '  ', annotations: [] }] }], {})).toBeNull();
    expect(segmentBiocDocument([{ passages: [{ text: 'short', annotations: [] }] }], {})).toBeNull();
    expect(segmentBiocDocument([], {})).toBeNull();
  });

  it('throws when the text exceeds the full-text limit', () => {
    const payload = [{ passages: [{ text: 'a'.repeat(MAX_FULL_TEXT_CHARACTERS + 1), annotations: [] }] }];
    expect(() => segmentBiocDocument(payload, { pmid: '12345678' })).toThrow(
      new RegExp(`exceeds the ${MAX_FULL_TEXT_CHARACTERS}-character full-text limit`),
    );
  });
});
