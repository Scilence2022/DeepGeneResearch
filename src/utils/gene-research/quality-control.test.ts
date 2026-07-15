import { describe, expect, it } from 'vitest';
import { GeneResearchQualityControl } from './quality-control';

describe('GeneResearchQualityControl', () => {
  it('assigns zero quality when no evidence or database fields exist', () => {
    const quality = new GeneResearchQualityControl('thrB', 'Escherichia coli').assessQuality(
      { geneSymbol: 'thrB', organism: 'Escherichia coli', geneID: '', alternativeNames: [], chromosomalLocation: '', genomicCoordinates: { chromosome: '', start: 0, end: 0, strand: '+' }, geneType: 'protein_coding', description: '' },
      { molecularFunction: [], biologicalProcess: [], cellularComponent: [], catalyticActivity: '', substrateSpecificity: '', bindingSites: [], enzymeClassification: '' },
      { uniprotId: '', proteinName: '', proteinSize: 0, molecularWeight: 0, isoelectricPoint: 0, subcellularLocation: [], proteinDomains: [], bindingSites: [], catalyticActivity: '', cofactors: [], postTranslationalModifications: [] },
      { tissueSpecificity: [], developmentalStage: [], environmentalResponse: [], expressionLevel: { high: [], medium: [], low: [] }, regulation: [] },
      { proteinInteractions: [], dnaInteractions: [], rnaInteractions: [], smallMoleculeInteractions: [], complexes: [] },
      [],
      { orthologs: [], paralogs: [], geneFamily: '', conservation: { overallConservation: 'medium', conservedDomains: [], variableRegions: [], functionalConservation: 'medium' }, duplicationEvents: [] },
      [],
    );

    expect(quality.overallScore).toBe(0);
    expect(quality.confidence).toBe(0);
  });
});
