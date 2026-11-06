import { afterEach, expect, it, vi } from 'vitest';
import { estimateResearchCost } from './research-telemetry';

afterEach(() => vi.unstubAllEnvs());

it('prices reported input, cached input, and output separately and marks unknown models', () => {
  vi.stubEnv('DGR_LLM_RATE_TABLE', JSON.stringify({
    schema: 'dgr.llm-rates.v1', version: 'test-rates', currency: 'USD',
    models: { 'test/known': { input: 3, cachedInput: 1, output: 5 } },
  }));
  const usage = {
    provider: 'test', calls: 2, callsWithReportedCache: 1, callsWithoutUsage: 1, phases: {},
    promptTokens: 1000, cachedPromptTokens: 250, completionTokens: 100, totalTokens: 1100,
  };
  const cost = estimateResearchCost({
    ...usage,
    models: { known: usage, unknown: { ...usage, promptTokens: 0, completionTokens: 0 } },
  });
  expect(cost).toMatchObject({ rateVersion: 'test-rates', incomplete: true, unpricedModels: ['unknown'] });
  expect(cost?.usd).toBeCloseTo(0.003);
});

it('makes invalid rate configuration visible without failing the research task', () => {
  vi.stubEnv('DGR_LLM_RATE_TABLE', '{malformed');
  const cost = estimateResearchCost({
    provider: 'test', calls: 0, callsWithReportedCache: 0, callsWithoutUsage: 0, phases: {}, models: {},
    promptTokens: 0, cachedPromptTokens: 0, completionTokens: 0, totalTokens: 0,
  });
  expect(cost).toMatchObject({ kind: 'unavailable', reason: 'invalid_rate_table', usd: null });
});
