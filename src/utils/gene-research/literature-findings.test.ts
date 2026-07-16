import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import {
  canonicalizePubMedAbstract,
  extractCitationBoundLiteratureFindings,
} from './literature-findings';

const target = {
  geneSymbol: 'lysC',
  organism: 'Escherichia coli',
  locusTag: 'b4024',
  proteinId: 'NP_418448.1',
  identityTerms: ['lysine-sensitive aspartokinase III'],
};

function pubmedSource({
  pmid = '12345678',
  title = 'Regulation of Escherichia coli lysC',
  abstract = 'The Escherichia coli lysC gene encodes lysine-sensitive aspartokinase III. Lysine inhibits LysC activity.',
  directness = 'direct',
}: {
  pmid?: string;
  title?: string;
  abstract?: string;
  directness?: 'direct' | 'gene_linked_context';
} = {}) {
  return {
    title,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    database: 'pubmed',
    confidence: 0.9,
    provenance: { provider: 'pubmed', recordId: pmid },
    structuredData: {
      targetRelevance: {
        accepted: true,
        score: 14,
        directness,
      },
      literatureReferences: [{
        pmid,
        title,
        abstract,
        year: 1998,
        doi: '10.1000/example',
      }],
    },
  };
}

describe('citation-bound literature finding extraction', () => {
  it('copies target-specific result sentences and binds each finding to one PMID', () => {
    const findings = extractCitationBoundLiteratureFindings([pubmedSource()], target);

    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        pmid: '12345678',
        doi: '10.1000/example',
        url: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
      }),
    ]));
    expect(findings.every(finding =>
      finding.statement.includes('lysC') || finding.statement.includes('LysC')
    )).toBe(true);
  });

  it('uses the immediately preceding target sentence as explicit context without paraphrasing', () => {
    const abstract = 'The Escherichia coli lysC gene was examined under lysine limitation. The enzyme was inhibited by excess lysine.';
    const findings = extractCitationBoundLiteratureFindings([pubmedSource({ abstract })], target);

    expect(findings).toHaveLength(1);
    expect(findings[0].statement).toBe(`${abstract}`);
    expect(findings[0].evidenceSentence).toBe('The enzyme was inhibited by excess lysine.');
  });

  it('binds the verbatim excerpt to canonical abstract UTF-16 offsets and hashes', () => {
    const abstract = '  The Escherichia\r\ncoli lysC gene was examined.\tThe enzyme was inhibited by lysine in cafe\u0301 cultures.  ';
    const canonicalAbstract = canonicalizePubMedAbstract(abstract);
    const findings = extractCitationBoundLiteratureFindings([pubmedSource({ abstract })], target);

    expect(findings).toHaveLength(1);
    const finding = findings[0];
    expect(finding.canonicalization).toBe('dgr.pubmed-abstract.v1');
    expect(finding.offsetEncoding).toBe('utf16_code_units');
    expect(finding.abstractLength).toBe(canonicalAbstract.length);
    expect(finding.abstractSha256).toBe(
      createHash('sha256').update(canonicalAbstract).digest('hex')
    );
    expect(canonicalAbstract.slice(finding.excerptStart, finding.excerptEnd))
      .toBe(finding.statement);
    expect(finding.evidenceSentence).toContain('caf\u00e9');
  });

  it('does not promote Gene-linked-only context to a biological finding', () => {
    const findings = extractCitationBoundLiteratureFindings([
      pubmedSource({ directness: 'gene_linked_context' }),
    ], target);

    expect(findings).toEqual([]);
  });

  it('rejects explicit LysC reagent, lysozyme C, and phage collisions', () => {
    const collisionSources = [
      pubmedSource({
        pmid: '25063446',
        title: 'Improved protein identification after LysC digestion',
        abstract: 'LysC protease digestion increased peptide identification in Escherichia coli samples.',
      }),
      pubmedSource({
        pmid: '19932188',
        title: 'Lysozyme C regulation',
        abstract: 'Lysozyme C expression increased in Escherichia coli challenge experiments.',
      }),
      pubmedSource({
        pmid: '27038077',
        title: 'A bacteriophage lysC lysis cassette',
        abstract: 'The bacteriophage lysC gene controls host lysis in Escherichia coli.',
      }),
    ];

    expect(extractCitationBoundLiteratureFindings(collisionSources, target)).toEqual([]);
  });

  it('does not misclassify product-name sensitivity or structural-gene wording', () => {
    const identityFinding = extractCitationBoundLiteratureFindings([
      pubmedSource({
        pmid: '3003049',
        abstract: 'The lysC gene encoding the lysine-sensitive aspartokinase III of Escherichia coli K12 has been cloned and its nucleotide sequence determined.',
      }),
    ], target);
    const operatorFinding = extractCitationBoundLiteratureFindings([
      pubmedSource({
        pmid: '231461',
        abstract: 'The lysC structural gene was examined. Their cis-dominance and operator-type characteristics indicate regulation of the regulon.',
      }),
    ], target);

    expect(identityFinding).toEqual([
      expect.objectContaining({ category: 'identity' }),
    ]);
    expect(operatorFinding).toEqual([
      expect.objectContaining({ category: 'regulation' }),
    ]);
  });
});
