import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  buildAnnotationCurationSummary,
  buildCodeXomicsAnnotationProposal,
} from './codexomics-annotation';

const target = {
  workspaceId: 'ws', genomeId: 'g', annotationRevision: 0,
  featureId: 'f', featureHash: 'h', chromosome: 'U00096',
  locusTag: 'b4491', geneSymbol: 'ycgH', organism: 'Escherichia coli', featureType: 'CDS',
};

describe('evidence ID consistency', () => {
  it('replays the failed ycgH task without cross-bound citations', () => {
    const tasks = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tasks.json'), 'utf8'));
    const items = Array.isArray(tasks) ? tasks : Object.values(tasks);
    const task = items.find((t: any) => t?.id === '72255bd7-8cb1-45ad-ae9e-3e6fd8d84fb1');
    expect(task).toBeTruthy();
    // Legacy result without an evidence-record set: the prebuilt summary must
    // be ignored and everything rebuilt so citation IDs always resolve.
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: task.parameters.geneSymbol,
      organism: task.parameters.organism,
      target: task.parameters.target,
      finalReport: task.result.finalReport,
      sources: task.result.sources,
      prebuiltResearchSummary: task.result.researchSummary,
      prebuiltCurationNote: task.result.annotationNote ?? undefined,
    });
    const records = new Map(proposal.evidenceManifest.sourceRecords.map(r => [r.id, r]));
    for (const lit of proposal.researchSummary.literature) {
      for (const id of lit.evidenceIds) {
        const record = records.get(id);
        expect(
          record?.identifiers?.some(i => i.scheme === 'pmid' && i.value === lit.pmid),
          `literature ${lit.pmid} must bind a pmid-identified record (got ${record?.label})`
        ).toBe(true);
      }
    }
    // The stray dermatology paper mined from free text never enters the
    // bibliography, the note, or any supporting evidence after the
    // verified-PMID filter.
    expect(proposal.researchSummary.literature.some(l => l.pmid === '2847703')).toBe(false);
    expect(proposal.curationNote?.allSourceCitations?.some(c => c.id === '2847703')).toBeFalsy();
    const strayRecord = proposal.evidenceManifest.sourceRecords.find(r => String(r.label).includes('2847703'));
    expect(strayRecord?.supporting).toBeFalsy();
  });

  it('keeps prebuilt record IDs stable when the full triple is provided', () => {
    const sources = [{
      title: 'LuxArray, a high-density, genomewide transcription analysis of Escherichia coli.',
      url: 'https://pubmed.ncbi.nlm.nih.gov/11544210/',
      database: 'pubmed',
      provenance: { provider: 'pubmed', recordId: '11544210' },
      structuredData: {
        targetRelevance: { accepted: true, score: 19, directness: 'gene_linked_context', reason: 'gene linked' },
        literatureReferences: [{
          pmid: '11544210',
          abstract: 'The promoters of ycgH were not generally DNA damage responsive in Escherichia coli.',
        }],
      },
    }];
    const bundle = buildAnnotationCurationSummary({
      geneSymbol: 'ycgH', organism: 'Escherichia coli', target, sources,
    });
    const proposal = buildCodeXomicsAnnotationProposal({
      geneSymbol: 'ycgH', organism: 'Escherichia coli', target,
      finalReport: 'ycgH report PMID:11544210',
      sources,
      prebuiltResearchSummary: bundle.researchSummary,
      prebuiltCurationNote: bundle.curationNote ?? null,
      prebuiltEvidenceRecords: bundle.sourceRecords,
    });
    // The manifest preserves the prebuilt record set verbatim (same IDs,
    // same order) so the summary's citation bindings stay valid.
    expect(proposal.evidenceManifest.sourceRecords).toEqual(bundle.sourceRecords);
    const lit = proposal.researchSummary.literature.find(l => l.pmid === '11544210');
    expect(lit).toBeTruthy();
    const record = proposal.evidenceManifest.sourceRecords.find(r => r.id === lit!.evidenceIds[0]);
    expect(record?.identifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({ scheme: 'pmid', value: '11544210' }),
    ]));
  });
});
