import { describe, expect, it } from 'vitest';
import DeepResearch from './index';

type UsageLike = { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null | undefined;

class TestableDeepResearch extends DeepResearch {
  record(phase: string, usage: UsageLike, model?: string, providerMetadata?: any) {
    this.recordLlmUsage(phase, usage, model, providerMetadata);
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
      cachedPromptTokens: 0,
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

  it('keeps two models apart so each can be priced on its own rate', () => {
    const research = createResearch();
    research.record('gene-llm-report', { promptTokens: 8_000, completionTokens: 2_600, totalTokens: 10_600 }, 'thinking-model');
    research.record('gene-llm-learnings', { promptTokens: 110_000, completionTokens: 6_000, totalTokens: 116_000 }, 'task-model');
    research.record('gene-llm-learnings', { promptTokens: 10_000, completionTokens: 1_000, totalTokens: 11_000 }, 'task-model');

    const usage = research.getLlmUsage();
    expect(Object.keys(usage.models).sort()).toEqual(['task-model', 'thinking-model']);
    expect(usage.models['thinking-model'].totalTokens).toBe(10_600);
    expect(usage.models['task-model'].totalTokens).toBe(127_000);
    expect(usage.models['task-model'].calls).toBe(2);
    expect(usage.models['task-model'].phases['gene-llm-learnings'].promptTokens).toBe(120_000);
    expect(usage.models['thinking-model'].phases['gene-llm-learnings']).toBeUndefined();
    expect(usage.provider).toBe('openai');
    // The per-phase view still totals the same tokens as the per-model view.
    expect(usage.totalTokens).toBe(137_600);
  });

  it('files usage without a model id under "unknown" rather than dropping it', () => {
    const research = createResearch();
    research.record('serp-query', { promptTokens: 10, completionTokens: 5, totalTokens: 15 });

    const usage = research.getLlmUsage();
    expect(usage.models.unknown.totalTokens).toBe(15);
    expect(usage.totalTokens).toBe(15);
  });

  it('records provider-reported cached input without inflating prompt tokens', () => {
    const research = createResearch();
    research.record(
      'gene-llm-learnings',
      { promptTokens: 100_000, completionTokens: 2_000, totalTokens: 102_000 },
      'task-model',
      { deepseek: { promptCacheHitTokens: 60_000 } }
    );
    research.record(
      'gene-llm-learnings',
      { promptTokens: 50_000, completionTokens: 1_000, totalTokens: 51_000 },
      'task-model'
    );

    const usage = research.getLlmUsage();
    expect(usage.promptTokens).toBe(150_000);
    expect(usage.cachedPromptTokens).toBe(60_000);
    expect(usage.models['task-model'].cachedPromptTokens).toBe(60_000);
  });

  it('ignores provider cache metadata that is not a usable number', () => {
    const research = createResearch();
    research.record('serp-query', { promptTokens: 10, totalTokens: 10 }, 'thinking-model', {
      deepseek: { promptCacheHitTokens: Number.NaN },
    });

    expect(research.getLlmUsage().cachedPromptTokens).toBe(0);
  });
});
