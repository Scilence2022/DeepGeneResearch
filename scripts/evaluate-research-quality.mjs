import { readFile } from 'node:fs/promises';
import path from 'node:path';

const targetFields = ['workspaceId', 'genomeId', 'featureId', 'featureHash', 'chromosome', 'organism'];
const claimKey = ({ statement, citation }) => JSON.stringify([
  statement,
  String(citation?.type || '').toLowerCase(),
  String(citation?.id || '').toLowerCase(),
]);
const empty = () => ({ cases: 0, correctTargets: 0, truePositive: 0, falsePositive: 0, falseNegative: 0, correctAbstentions: 0, abstentionCases: 0, unexpectedOperations: 0 });
const rate = (numerator, denominator) => denominator ? numerator / denominator : null;
const metrics = counts => ({
  ...counts,
  targetAccuracy: rate(counts.correctTargets, counts.cases),
  directEvidencePrecision: rate(counts.truePositive, counts.truePositive + counts.falsePositive),
  directEvidenceRecall: rate(counts.truePositive, counts.truePositive + counts.falseNegative),
  abstentionAccuracy: rate(counts.correctAbstentions, counts.abstentionCases),
});

try {
  const [, , file, gate] = process.argv;
  if (!file || (gate && gate !== '--require-safety')) throw new Error();
  const dataset = JSON.parse(await readFile(file, 'utf8'));
  if (dataset?.schema !== 'dgr.quality-labels.v1' || !Array.isArray(dataset.cases) || !dataset.cases.length) throw new Error();
  const counts = empty();
  const strata = new Map();
  for (const example of dataset.cases) {
    if (!example || typeof example.artifact !== 'string' || typeof example.stratum !== 'string'
      || !example.target || !targetFields.every(field => typeof example.target[field] === 'string' && example.target[field])
      || !Number.isInteger(example.target.annotationRevision)
      || !Array.isArray(example.claims) || !example.claims.every(claim =>
        typeof claim?.statement === 'string' && typeof claim.citation?.id === 'string' && typeof claim.citation.type === 'string')
      || !Array.isArray(example.allowedOperations) || !example.allowedOperations.every(field => typeof field === 'string')) throw new Error();
    const artifact = JSON.parse(await readFile(path.resolve(path.dirname(file), example.artifact), 'utf8'));
    const proposal = artifact.annotationProposal;
    if (!proposal || !Array.isArray(proposal.researchSummary?.facts) || !Array.isArray(proposal.operations)) throw new Error();
    const observed = new Set(proposal.researchSummary.facts.filter(fact => fact.literatureBasis).map(claimKey));
    const expected = new Set(example.claims.map(claimKey));
    const stratum = strata.get(example.stratum) ?? empty();
    strata.set(example.stratum, stratum);
    for (const accumulator of [counts, stratum]) {
      accumulator.cases++;
      if (targetFields.every(field => proposal.target?.[field] === example.target[field])
        && proposal.baseRevision === example.target.annotationRevision) accumulator.correctTargets++;
      for (const claim of observed) accumulator[expected.has(claim) ? 'truePositive' : 'falsePositive']++;
      for (const claim of expected) if (!observed.has(claim)) accumulator.falseNegative++;
      if (!expected.size) {
        accumulator.abstentionCases++;
        if (!observed.size) accumulator.correctAbstentions++;
      }
      accumulator.unexpectedOperations += proposal.operations.filter(operation => !example.allowedOperations.includes(operation.field)).length;
    }
  }
  console.log(JSON.stringify({
    schema: 'dgr.quality-evaluation.v1',
    overall: metrics(counts),
    strata: Object.fromEntries([...strata].map(([stratum, values]) => [stratum, metrics(values)])),
  }, null, 2));
  if (gate && (counts.correctTargets !== counts.cases || counts.falsePositive || counts.unexpectedOperations)) process.exitCode = 2;
} catch {
  console.error('Quality evaluation could not read the labels or artifacts. Usage: node scripts/evaluate-research-quality.mjs <labels.json> [--require-safety]');
  process.exitCode = 1;
}
