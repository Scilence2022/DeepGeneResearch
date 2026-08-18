import { describe, expect, it } from 'vitest';
import DeepResearch from './index';

class TestableDeepResearch extends DeepResearch {
  record(phase: string, usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null | undefined) {
    this.recordLlmUsage(phase, usage);
  }
}

function createResearch(): TestableDeepResearch {
  return new TestableDeepResearch({
    AIProvider: {
      provider: 'openai',
      thinkingModel: 'thinking-model',
      taskModel: 'task-model',
      baseURL: 'https://example.test',
      apiKey: 'test-key',
    },
    searchProvider: { provider: 'model' },
    language: 'English',
  } as any);
}

describe('LLM token usage accounting', () => {
  it('aggregates provider-reported usage per phase and in total', () => {
    const research = createResearch();
    research.record('serp-query', { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    research.record('gene-llm-learnings', { promptTokens: 400, completionTokens: 200, totalTokens: 600 });
    research.record('gene-llm-learnings', { promptTokens: 300, completionTokens: 100, totalTokens: 400 });

    const usage = research.getLlmUsage();
    expect(usage.calls).toBe(3);
    expect(usage.promptTokens).toBe(800);
    expect(usage.completionTokens).toBe(350);
    expect(usage.totalTokens).toBe(1150);
    expect(usage.phases['gene-llm-learnings']).toEqual({
      calls: 2,
      promptTokens: 700,
      completionTokens: 300,
      totalTokens: 1000,
    });
    expect(usage.phases['serp-query'].calls).toBe(1);
  });

  it('ignores missing usage payloads and tolerates partial fields', () => {
    const research = createResearch();
    research.record('final-report', undefined);
    research.record('final-report', null);
    research.record('final-report', { totalTokens: 42 });

    const usage = research.getLlmUsage();
    expect(usage.calls).toBe(1);
    expect(usage.totalTokens).toBe(42);
    expect(usage.promptTokens).toBe(0);
  });
});
