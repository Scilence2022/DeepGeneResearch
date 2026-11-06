import { AsyncLocalStorage } from 'node:async_hooks';

const limits = {
  modelCalls: 48,
  reservedOutputTokens: 220_000,
  providerRequests: 600,
  downloadedBytes: 100 * 1024 * 1024,
  parsedPages: 1_000,
  parsedCharacters: 4_500_000,
};

type Resource = keyof typeof limits;
type ProviderOutcome = 'success' | 'http_error' | 'network_error' | 'interrupted';

export class ResearchBudgetExceededError extends Error {
  constructor(readonly resource: Resource) {
    super(`Research budget exhausted for ${resource}`);
    this.name = 'ResearchBudgetExceededError';
  }
}

class RunBudget {
  private used: Partial<Record<Resource, number>> = {};
  private exhausted = new Set<Resource>();
  private providers = new Map<string, {
    requests: number;
    retries: number;
    durationMs: number;
    outcomes: Partial<Record<ProviderOutcome, number>>;
  }>();

  charge(resource: Resource, amount = 1) {
    const total = (this.used[resource] ?? 0) + amount;
    if (total > limits[resource]) {
      this.exhausted.add(resource);
      throw new ResearchBudgetExceededError(resource);
    }
    this.used[resource] = total;
  }

  remaining(resource: Resource) {
    return limits[resource] - (this.used[resource] ?? 0);
  }

  recordProvider(provider: string, outcome: ProviderOutcome, durationMs: number, attempt: number) {
    const stats = this.providers.get(provider) ?? { requests: 0, retries: 0, durationMs: 0, outcomes: {} };
    stats.requests++;
    stats.retries += attempt > 1 ? 1 : 0;
    stats.durationMs += Math.round(durationMs);
    stats.outcomes[outcome] = (stats.outcomes[outcome] ?? 0) + 1;
    this.providers.set(provider, stats);
  }

  snapshot() {
    return {
      schema: 'dgr.run-budget.v1',
      used: { ...this.used },
      limits: { ...limits },
      exhausted: [...this.exhausted],
      providers: Object.fromEntries(this.providers),
    };
  }
}

const context = new AsyncLocalStorage<RunBudget>();

export function runWithResearchBudget<T>(work: () => T): T {
  return context.getStore() ? work() : context.run(new RunBudget(), work);
}

export function researchBudget() {
  return context.getStore();
}

export function reserveModelCall(maxTokens: number) {
  const budget = researchBudget();
  budget?.charge('modelCalls');
  budget?.charge('reservedOutputTokens', maxTokens);
  // Keep SDK retries within a stage for callers without a run budget. In a
  // budgeted run each model invocation consumes one reserved provider call.
  return { maxTokens, ...(budget ? { maxRetries: 0 } : {}) };
}

export async function fetchResearchProvider(input: RequestInfo | URL, init?: RequestInit, provider = 'gene-retrieval', attempt = 1) {
  init?.signal?.throwIfAborted();
  const budget = researchBudget();
  budget?.charge('providerRequests');
  const started = performance.now();
  let outcome: ProviderOutcome = 'network_error';
  try {
    const response = await fetch(input, init);
    outcome = response.ok ? 'success' : 'http_error';
    return response;
  } catch (error) {
    if (init?.signal?.aborted) outcome = 'interrupted';
    throw error;
  } finally {
    budget?.recordProvider(provider, outcome, performance.now() - started, attempt);
  }
}
