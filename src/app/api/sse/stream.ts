import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { runWithResearchBudget } from '@/services/research-run-budget';
import { initDeepResearchServer } from '@/services/research-engine';
import { createFetchSignal } from '@/utils/fetch-signal';
import { researchOptions } from '../research/shared';

export const streamOptions = researchOptions.extend({
  provider: z.string().min(1).max(64).optional(),
  thinkingModel: z.string().min(1).max(128).optional(),
  taskModel: z.string().min(1).max(128).optional(),
  searchProvider: z.string().min(1).max(64).optional(),
});

let activeStreams = 0;
const activeWorkspaces = new Set<string>();
const MAX_STREAMS = 2;
const encoder = new TextEncoder();

export function streamResearch(request: NextRequest, input: unknown, textOnly = false, workspaceId?: string) {
  const parsed = streamOptions.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid research options', issues: parsed.error.issues }, { status: 400 });
  }
  if (activeStreams >= MAX_STREAMS || (workspaceId && activeWorkspaces.has(workspaceId))) {
    return NextResponse.json({ error: 'Research stream capacity reached' }, { status: 429, headers: { 'Retry-After': '10' } });
  }

  const { query, enableCitationImage, enableReferences, ...engineOptions } = parsed.data;
  let engine: ReturnType<typeof initDeepResearchServer>;
  try {
    engine = initDeepResearchServer(engineOptions);
  } catch {
    return NextResponse.json({ error: 'Research provider is unavailable' }, { status: 400 });
  }

  const execution = new AbortController();
  const signal = createFetchSignal(AbortSignal.any([request.signal, execution.signal]), 300_000);
  let closed = false;
  activeStreams += 1;
  if (workspaceId) activeWorkspaces.add(workspaceId);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: any) => {
        if (closed || request.signal.aborted) return;
        if (textOnly) {
          if (event === 'message' && typeof data.text === 'string') controller.enqueue(encoder.encode(data.text));
          return;
        }
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const onDisconnect = () => {
        if (closed) return;
        closed = true;
        controller.close();
      };
      request.signal.addEventListener('abort', onDisconnect, { once: true });
      if (request.signal.aborted) onDisconnect();
      const heartbeat = textOnly ? undefined : setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 15_000);
      send('infor', { name: 'deep-research', version: '0.1.0' });
      engine.onMessage = (event, data) => {
        if (event !== 'error') send(event, data);
      };

      void runWithResearchBudget(() => engine.start(query, enableCitationImage, enableReferences, undefined, signal))
        .then(() => send('completed', { status: 'completed' }))
        .catch(() => send('error', { message: signal.aborted ? 'Research interrupted' : 'Research failed' }))
        .finally(() => {
          activeStreams -= 1;
          if (workspaceId) activeWorkspaces.delete(workspaceId);
          clearInterval(heartbeat);
          request.signal.removeEventListener('abort', onDisconnect);
          onDisconnect();
        });
    },
    cancel() {
      closed = true;
      execution.abort();
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': textOnly ? 'text/plain; charset=utf-8' : 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      'X-Accel-Buffering': 'no',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
