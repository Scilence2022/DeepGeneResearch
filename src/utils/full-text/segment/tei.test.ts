import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { FULL_TEXT_CANONICALIZATION, FULL_TEXT_OFFSET_ENCODING } from '@/utils/gene-research/full-text';
import { segmentTeiDocument } from './tei';

const paragraph =
  'The dapA gene encodes dihydrodipicolinate synthase, which catalyzes the committed step of ' +
  'lysine biosynthesis in Escherichia coli. ';

function teiFixture(bodyText: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<TEI xmlns="http://www.tei-c.org/ns/1.0">' +
    '<teiHeader><fileDesc><titleStmt><title>Fixture</title></titleStmt></fileDesc></teiHeader>' +
    `<text><body><div><p>${bodyText}</p></div></body></text></TEI>`
  );
}

const fullXml = teiFixture(paragraph.repeat(12));

describe('segmentTeiDocument', () => {
  it('segments a GROBID TEI document into the shared model', () => {
    const document = segmentTeiDocument(fullXml, {
      doi: '10.1000/xyz',
      openalexId: 'https://openalex.org/W123',
      sourceUrl: 'https://content.openalex.org/works/W123.grobid-xml?api_key=k',
    });

    expect(document).not.toBeNull();
    expect(document!.schema).toBe('dgr.full-text-document.v1');
    expect(document!.origin).toBe('tei');
    expect(document!.mediaType).toBe('application/xml');
    expect(document!.parser).toBe('openalex-grobid-tei');
    expect(document!.name).toBe('https://openalex.org/W123.tei.xml');
    expect(document!.text).toContain('dihydrodipicolinate synthase');
    expect(document!.text).not.toContain('<p>');
    expect(document!.documentSha256).toBe(createHash('sha256').update(fullXml).digest('hex'));
    expect(document!.textSha256).toBe(createHash('sha256').update(document!.text).digest('hex'));
    expect(document!.textLength).toBe(document!.text.length);
    expect(document!.canonicalization).toBe(FULL_TEXT_CANONICALIZATION);
    expect(document!.offsetEncoding).toBe(FULL_TEXT_OFFSET_ENCODING);
    expect(document!.pageCount).toBeNull();
    expect(document!.parsedPageCount).toBeNull();
    expect(document!.parseCoverage).toBe(1);
    expect(document!.pages).toEqual([]);
    expect(document!.identifiers).toEqual({ pmid: undefined, pmcid: undefined, doi: '10.1000/xyz' });
    expect(document!.sourceUrl).toBe('https://content.openalex.org/works/W123.grobid-xml?api_key=k');
  });

  it('honours an explicit name override', () => {
    const document = segmentTeiDocument(fullXml, { name: 'W123.tei.xml' });
    expect(document!.name).toBe('W123.tei.xml');
  });

  it('returns null when the extracted body text is too short', () => {
    const document = segmentTeiDocument(teiFixture('Short abstract only.'), { doi: '10.1000/xyz' });
    expect(document).toBeNull();
  });
});
