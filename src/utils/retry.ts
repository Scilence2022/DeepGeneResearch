/**
 * Retry mechanism for search providers
 * Adds resilience to transient failures
 */

interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const delay = Math.min(
    options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt),
    options.maxDelayMs
  );
  // Add jitter (0-25% of delay)
  return delay * (1 + Math.random() * 0.25);
}

/**
 * Check if error is retryable
 */
function isRetryable(error: any): boolean {
  // Network errors
  if (error?.code === 'ECONNRESET' || 
      error?.code === 'ETIMEDOUT' || 
      error?.code === 'ENOTFOUND' ||
      error?.code === 'ECONNREFUSED') {
    return true;
  }
  
  // HTTP errors that might be transient
  if (error?.status === 429 ||  // Rate limited
      error?.status === 500 ||  // Internal server error
      error?.status === 502 ||  // Bad gateway
      error?.status === 503 ||  // Service unavailable
      error?.status === 504) {  // Gateway timeout
    return true;
  }
  
  // Generic fetch failures
  if (error?.message?.includes('fetch failed') ||
      error?.message?.includes('network') ||
      error?.message?.includes('timeout')) {
    return true;
  }
  
  return false;
}

export interface RetryableFunction<T> {
  (): Promise<T>;
}

/**
 * Execute function with retry logic
 */
export async function withRetry<T>(
  fn: RetryableFunction<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // If this is the last attempt or error is not retryable, throw immediately
      if (attempt >= opts.maxRetries || !isRetryable(error)) {
        throw error;
      }
      
      // Calculate and sleep for delay
      const delay = calculateDelay(attempt, opts);
      console.log(`[Retry] Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Create a retrying version of a fetch-based function
 */
export function createRetryingFunction<Options, Result>(
  originalFn: (options: Options) => Promise<Result>,
  options?: Partial<RetryOptions>
): (options: Options) => Promise<Result> {
  return async (opts: Options): Promise<Result> => {
    return withRetry(async () => {
      return originalFn(opts);
    }, options);
  };
}

/**
 * Retry configuration for different search providers
 */
export const RETRY_CONFIGS: Record<string, Partial<RetryOptions>> = {
  pubmed: {
    maxRetries: 3,
    initialDelayMs: 2000,
    maxDelayMs: 15000
  },
  uniprot: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000
  },
  kegg: {
    maxRetries: 3,
    initialDelayMs: 1500,
    maxDelayMs: 12000
  },
  pdb: {
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000
  },
  default: {
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 10000
  }
};
