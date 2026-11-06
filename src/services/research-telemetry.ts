import type { LlmUsageSummary } from '@/utils/deep-research';

type UsageRates = {
  schema: 'dgr.llm-rates.v1';
  version: string;
  currency: 'USD';
  models: Record<string, { input: number; cachedInput: number; output: number }>;
};

function readRates(): UsageRates | undefined {
  if (!process.env.DGR_LLM_RATE_TABLE) return;
  const config: UsageRates = JSON.parse(process.env.DGR_LLM_RATE_TABLE);
  if (config?.schema !== 'dgr.llm-rates.v1' || config.currency !== 'USD'
    || !/^[a-zA-Z0-9._-]{1,64}$/.test(config.version) || !config.models
    || typeof config.models !== 'object' || Array.isArray(config.models)
    || Object.values(config.models).some(rate => !rate || [rate.input, rate.cachedInput, rate.output]
      .some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0))) {
    throw new Error('Invalid DGR_LLM_RATE_TABLE');
  }
  return config;
}

export function estimateResearchCost(usage?: LlmUsageSummary) {
  if (!usage) return;
  let rates: UsageRates | undefined;
  try {
    rates = readRates();
  } catch {
    return { schema: 'dgr.llm-cost.v1', kind: 'unavailable' as const, reason: 'invalid_rate_table', usd: null };
  }
  if (!rates) return;
  let usd = 0;
  let pricedModels = 0;
  const unpricedModels: string[] = [];
  for (const [id, model] of Object.entries(usage.models)) {
    const key = `${usage.provider}/${id}`;
    const rate = Object.hasOwn(rates.models, key) ? rates.models[key] : undefined;
    if (!rate) {
      unpricedModels.push(id);
      continue;
    }
    const cached = Math.min(model.promptTokens, model.cachedPromptTokens);
    usd += ((model.promptTokens - cached) * rate.input + cached * rate.cachedInput + model.completionTokens * rate.output) / 1_000_000;
    pricedModels++;
  }
  return {
    schema: 'dgr.llm-cost.v1',
    kind: 'estimated' as const,
    currency: rates.currency,
    rateVersion: rates.version,
    usd: pricedModels ? usd : null,
    unpricedModels,
    incomplete: unpricedModels.length > 0 || usage.callsWithoutUsage > 0 || usage.callsWithReportedCache < usage.calls,
    // Input tokens without a reported cache breakdown use the input rate.
    cacheBreakdownMissing: usage.callsWithReportedCache < usage.calls,
  };
}

export function recordResearchEvent(event: 'started' | 'completed' | 'failed' | 'cancelled', fields: {
  taskId: string;
  attempt?: number;
  queueMs?: number;
  durationMs?: number;
  artifactBytes?: number;
  cacheReplay?: boolean;
  errorCode?: string;
  phaseMs?: Record<string, number>;
  estimatedUsd?: number | null;
  rateVersion?: string;
  costIncomplete?: boolean;
}) {
  if (process.env.DGR_RESEARCH_TELEMETRY !== '1') return;
  console.info(JSON.stringify({ schema: 'dgr.research-event.v1', event, timestamp: new Date().toISOString(), ...fields }));
}
