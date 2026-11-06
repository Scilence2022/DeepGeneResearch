import { NextResponse } from 'next/server';
import { runWithResearchBudget } from '@/services/research-run-budget';

const runtime = globalThis as typeof globalThis & {
  dgrAdmission?: {
    windows: Map<string, { expires: number; requests: number }>;
    synchronousTools: Set<string>;
  };
};
const { windows, synchronousTools } = runtime.dgrAdmission ??= {
  windows: new Map(),
  synchronousTools: new Set(),
};

/** A bounded admission window for authenticated operations that can consume resources. */
export function admitResearchRequest(workspaceId?: string): NextResponse | undefined {
  const now = Date.now();
  for (const [key, window] of windows) {
    if (window.expires <= now) windows.delete(key);
  }
  const key = workspaceId ?? '';
  const window = windows.get(key) ?? { expires: now + 60_000, requests: 0 };
  if (window.requests >= 60) {
    return NextResponse.json(
      { error: 'Research request limit reached' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((window.expires - now) / 1000)) } },
    );
  }
  window.requests += 1;
  windows.set(key, window);
}


// Synchronous MCP calls have no durable queue slot. Bound them separately.
export async function runAdmittedResearchTool<T>(workspaceId: string | undefined, tool: () => Promise<T>): Promise<T> {
  const key = workspaceId ?? '';
  if (synchronousTools.size >= 4 || synchronousTools.has(key)) throw new Error('Synchronous research tool capacity reached');
  synchronousTools.add(key);
  try {
    return await runWithResearchBudget(tool);
  } finally {
    synchronousTools.delete(key);
  }
}
