export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    if (process.env.VERCEL || process.env.CF_PAGES || !process.env.MCP_AI_PROVIDER
      || process.env.NEXT_PHASE === 'phase-production-build') return;

    const { taskQueue } = await import('@/services/task-queue');
    void taskQueue.start().catch(error => {
      console.error('[TaskQueue] Startup recovery unavailable:', error instanceof Error ? error.name : 'UnknownError');
    });
  }
}
