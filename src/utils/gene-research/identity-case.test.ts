import { describe, expect, it } from 'vitest';
import { assessGeneTargetRelevance } from './search-providers';
import { extractCitationBoundLiteratureFindings } from './literature-findings';

// Real collisions found in the CodeXomics E. coli maintenance cohort (2026-08/09).
const nudE = {
  geneSymbol: 'nudE',
  organism: 'Escherichia coli',
  locusTag: 'b3397',
  proteinId: 'P45799',
  identityTerms: ['ADP compounds hydrolase NudE'],
};

describe('case-significant target identity', () => {
  it('does not read "nude mice" as nudE (PMID 361546)', () => {
    const relevance = assessGeneTargetRelevance(
      'Deficient antibody formation in the bone marrow of nude mice.',
      'The bone marrow of young adult nude mice was investigated as a site of antibody formation after intravenous '
        + 'immunization with the thymus-independent antigen Escherichia coli lipopolysaccharide (LPS).',
      nudE,
    );
    expect(relevance.matchedBy).not.toContain('gene_symbol');
    expect(relevance.directness).not.toBe('direct');
  });

  it('does not read nude-mouse xenograft studies as nudE (PMID 10830782)', () => {
    const relevance = assessGeneTargetRelevance(
      'Plasma Escherichia coli beta-galactosidase as a marker of tumor burden and response to experimental '
        + 'anti-neoplastic therapy in nude mice xenografted with lacZ transduced human tumor cells.',
      'Growth of the same cells in nude mice produced readily measurable levels of E. coli beta-galactosidase enzyme '
        + 'activity in host plasma.',
      nudE,
    );
    expect(relevance.directness).not.toBe('direct');
  });

  it('does not read the bradykinin antagonist B4308 as locus tag b4308 (PMID 3362744)', () => {
    const relevance = assessGeneTargetRelevance(
      'The inhibition of glandular kallikrein by peptide analog antagonists of bradykinin.',
      'The Ki values for B4307, B4308 and B3852 are 0.5, 0.3 and 2.5 microM, respectively. B4308 and B3852 were also '
        + "shown to inhibit rat urinary kallikrein with Ki's of 1.0 and 5.5 microM.",
      { geneSymbol: 'yjhR', organism: 'Escherichia coli', locusTag: 'b4308' },
    );
    expect(relevance.accepted).toBe(false);
  });

  it('does not read blood-group allele codes as locus tag b0101 (PMID 11019913)', () => {
    const relevance = assessGeneTargetRelevance(
      'Polymorphism of the ABO blood group genes in Han, Kazak and Uygur populations in the Silk Route of northwestern China.',
      'The frequencies of B0101 in Kazak, Uygur and Han were comparable to those of other Asian populations.',
      { geneSymbol: 'yacG', organism: 'Escherichia coli', locusTag: 'b0101' },
    );
    expect(relevance.accepted).toBe(false);
  });

  it('requires the organism for a canonical locus-tag match', () => {
    const relevance = assessGeneTargetRelevance(
      'Antimycobacterial screening of phenazine derivatives',
      'Exposure of the mycobacteria to b4128 resulted in immediate, dose-related enhancement of PLA2 activity.',
      { geneSymbol: 'ghoS', organism: 'Escherichia coli', locusTag: 'b4128' },
    );
    expect(relevance.directness).not.toBe('direct');
  });

  it('still accepts the protein-style symbol in an E. coli study', () => {
    const relevance = assessGeneTargetRelevance(
      'Escherichia coli NudE is a Nudix hydrolase that degrades ADP-sugars',
      'We show that NudE from Escherichia coli hydrolyses ADP-ribose and ADP-mannose; a nudE mutant accumulates ADP-sugars.',
      nudE,
    );
    expect(relevance.accepted).toBe(true);
    expect(relevance.directness).toBe('direct');
  });

  it('still accepts a lowercase locus tag together with the organism', () => {
    const relevance = assessGeneTargetRelevance(
      'Transcriptome profiling of Escherichia coli K-12 stress responses',
      'In Escherichia coli, deletion of b4308 reduced growth under acid stress.',
      { geneSymbol: 'yjhR', organism: 'Escherichia coli', locusTag: 'b4308' },
    );
    expect(relevance.accepted).toBe(true);
    expect(relevance.directness).toBe('direct');
  });

  it('does not let a stable identifier bypass a conflicting source organism', () => {
    expect(assessGeneTargetRelevance(
      'Characterization of b3397 in Pseudomonas aeruginosa',
      'The b3397 gene encodes an enzyme. Escherichia coli was used as an expression host.', nudE,
    ).accepted).toBe(false);
    expect(assessGeneTargetRelevance(
      'Characterization of b3397 in Pseudomonas aeruginosa',
      'The b3397 gene encodes an enzyme. Escherichia coli was used as an expression host.', nudE, true,
    ).directness).toBe('gene_linked_context');
  });

  it('does not turn a shared phage product name into nfi evidence', () => {
    expect(assessGeneTargetRelevance(
      'T4 endonuclease V repairs ultraviolet damage',
      'Endonuclease V was expressed in Escherichia coli and increased repair activity.',
      { geneSymbol: 'nfi', organism: 'Escherichia coli', locusTag: 'b3998', identityTerms: ['endonuclease V'] },
    ).accepted).toBe(false);
  });
});

describe('case-significant sentence selection', () => {
  it('does not let a duplicate case-insensitive alias reintroduce nude mice', () => {
    const abstract = 'The bone marrow of nude mice showed antibody activity after Escherichia coli immunization.';
    expect(extractCitationBoundLiteratureFindings([{
      title: 'A nudE study', database: 'pubmed',
      structuredData: {
        targetRelevance: { accepted: true, directness: 'direct' },
        literatureReferences: [{ pmid: '12345678', abstract }],
      },
    }], { ...nudE, identityTerms: ['nudE', 'NUDE', 'b3397'] })).toEqual([]);
  });
  it('selects no finding from a sentence that mentions only nude mice', () => {
    const abstract = 'The bone marrow of young adult nude mice was investigated after immunization with Escherichia coli '
      + 'lipopolysaccharide. During the secondary response the nude mice showed PFC activity in the bone marrow, but at '
      + 'a much lower level than their heterozygous littermates.';
    const findings = extractCitationBoundLiteratureFindings([{
      title: 'Deficient antibody formation in the bone marrow of nude mice.',
      url: 'https://pubmed.ncbi.nlm.nih.gov/361546/',
      database: 'pubmed',
      provenance: { provider: 'pubmed', recordId: '361546' },
      structuredData: {
        targetRelevance: { accepted: true, score: 12, directness: 'direct' },
        literatureReferences: [{ pmid: '361546', title: 'Deficient antibody formation', abstract, year: 1978 }],
      },
    }], { geneSymbol: 'nudE', organism: 'Escherichia coli', locusTag: 'b3397' });
    expect(findings).toHaveLength(0);
  });
});
