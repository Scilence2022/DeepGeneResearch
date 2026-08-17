import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateTextMock = vi.fn();
const streamTextMock = vi.fn();

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  streamText: (...args: unknown[]) => streamTextMock(...args),
}));

vi.mock('./provider', () => ({
  createAIProvider: vi.fn().mockResolvedValue({ modelId: 'fake-model' }),
}));

import DeepResearch from './index';

function makeDeepResearch() {
  return new DeepResearch({
    AIProvider: {
      baseURL: 'http://unused',
      apiKey: 'test-key',
      provider: 'openai',
      thinkingModel: 'gpt-test-thinking',
      taskModel: 'gpt-test-task',
    },
    searchProvider: {
      baseURL: '',
      provider: 'model',
      maxResult: 5,
    },
  });
}

const GENE_INFO = {
  geneSymbol: 'lysC',
  organism: 'Escherichia coli',
  target: { locusTag: 'b4024', proteinId: 'P08660' },
  researchFocus: ['function'],
  specificAspects: ['phenotype'],
};

describe('gene LLM pipeline', () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    streamTextMock.mockReset();
  });

  it('turns the user research question into supplemental retrieval queries', async () => {
    generateTextMock.mockResolvedValue({
      text: JSON.stringify([
        { query: 'lysC aspartate kinase regulation Escherichia coli', researchGoal: 'Regulation evidence' },
        { query: 'lysC allosteric inhibition lysine', researchGoal: 'Allostery evidence' },
      ]),
    });
    const deepResearch = makeDeepResearch();
    const tasks = await (deepResearch as any).generateGeneSupplementalQueries(
      GENE_INFO,
      'Refine function, regulation, pathway role, complexes, and phenotype of {geneSymbol} in {organism}.',
    );
    expect(tasks).toHaveLength(2);
    expect(tasks[0].query).toContain('lysC');
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('degrades to no supplemental queries when the model call fails', async () => {
    generateTextMock.mockRejectedValue(new Error('provider down'));
    const deepResearch = makeDeepResearch();
    const tasks = await (deepResearch as any).generateGeneSupplementalQueries(
      GENE_INFO,
      'Study {geneSymbol} in {organism}.',
    );
    expect(tasks).toEqual([]);
  });

  it('map-reduces retained abstracts into batched learnings', async () => {
    generateTextMock.mockImplementation(async () => ({
      text: `Learnings: lysC is lysine-sensitive aspartokinase III [1].`,
    }));
    const deepResearch = makeDeepResearch();
    const literature = Array.from({ length: 25 }, (_, index) => ({
      title: `lysC study ${index}`,
      pmid: String(8000000 + index),
      abstract: `Study ${index} demonstrates lysC encodes aspartokinase III in Escherichia coli with feedback inhibition.`,
    }));
    const learnings = await (deepResearch as any).summarizeGeneLiterature(
      literature,
      GENE_INFO,
      'Refine function and regulation of {geneSymbol} in {organism}.',
    );
    expect(learnings).toHaveLength(2);
    expect(learnings[0]).toContain('[literature batch 1/2]');
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('keeps the template report when synthesis fails', async () => {
    streamTextMock.mockImplementation(() => {
      throw new Error('stream unavailable');
    });
    const deepResearch = makeDeepResearch();
    const synthesized = await (deepResearch as any).synthesizeGeneReport({
      geneInfo: GENE_INFO,
      userPrompt: 'Refine function of {geneSymbol} in {organism}.',
      templateReport: '# Template report\n\nDeterministic content.',
      learnings: [],
      sources: [],
      coverageSummary: '',
      enableReferences: true,
    });
    expect(synthesized).toBeNull();
  });

  it('streams an LLM-synthesized report with references appended', async () => {
    streamTextMock.mockImplementation(() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', textDelta: '# Synthesized lysC report\n\nBody text.' };
      })(),
    }));
    const deepResearch = makeDeepResearch();
    const synthesized = await (deepResearch as any).synthesizeGeneReport({
      geneInfo: GENE_INFO,
      userPrompt: 'Refine function of {geneSymbol} in {organism}.',
      templateReport: '# Template report\n\nDeterministic content.',
      learnings: [],
      sources: [{ title: 'lysC primary study', url: 'https://pubmed.ncbi.nlm.nih.gov/8660667/', formattedCitation: 'Author A. (1996). lysC primary study. Journal.' }],
      coverageSummary: '',
      enableReferences: true,
    });
    expect(synthesized).toContain('Synthesized lysC report');
    expect(synthesized).toContain('## References');
    expect(synthesized).toContain('Author A. (1996)');
  });
});
