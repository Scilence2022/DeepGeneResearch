import { NextRequest, NextResponse } from 'next/server';
import type { GeneResearchTask } from '@/models/task';
import { TERMINAL_TASK_STATUSES } from '@/models/task';
import { taskQueue } from '@/services/task-queue';
import { taskStore } from '@/services/task-store';
import { authenticateResearch } from '../../../auth';

export const dynamic = 'force-dynamic';

const MAX_SUBSCRIBERS = 40;
const encoder = new TextEncoder();
let subscribers = 0;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  const principal = authenticateResearch(request);
  if (principal instanceof NextResponse) return principal;

  const { taskId } = await params;
  try {
    await taskQueue.start();
    const task = await taskStore.getTaskMetadata(taskId);
    if (!task || task.workspaceId !== principal.workspaceId || task.parameters.mode === 'general') return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Research task store unavailable' }, { status: 503 });
  }

  if (subscribers >= MAX_SUBSCRIBERS) {
    return NextResponse.json({ error: 'Progress stream capacity reached' }, { status: 429 });
  }

  subscribers += 1;
  const resultUrl = `/api/mcp/tasks/${taskId}`;
  const events = ['task:progress', 'task:completed', 'task:failed', 'task:cancelled'];
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let eventSeq = -1;
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 15_000);
      cleanup = () => {
        if (closed) return;
        closed = true;
        subscribers -= 1;
        clearInterval(heartbeat);
        for (const event of events) taskQueue.off(event, onTask);
        request.signal.removeEventListener('abort', close);
      };
      const close = () => {
        if (closed) return;
        cleanup();
        controller.close();
      };
      const send = (task: GeneResearchTask, type: string) => {
        if (closed || task.eventSeq <= eventSeq) return;
        eventSeq = task.eventSeq;
        const snapshot = {
          type,
          taskId,
          status: task.status,
          progress: task.progress,
          step: task.step,
          eventSeq,
          updatedAt: task.updatedAt,
          error: task.error,
          ...(task.status === 'completed' ? { resultUrl } : {}),
        };
        controller.enqueue(encoder.encode(`id: ${eventSeq}\ndata: ${JSON.stringify(snapshot)}\n\n`));
      };
      const onTask = (task: GeneResearchTask) => {
        if (task.id !== taskId || task.workspaceId !== principal.workspaceId || task.eventSeq <= eventSeq || closed) return;
        const terminal = TERMINAL_TASK_STATUSES.has(task.status);
        send(task, terminal ? task.status : 'progress');
        if (terminal) close();
      };
      for (const event of events) taskQueue.on(event, onTask);
      request.signal.addEventListener('abort', close, { once: true });
      if (request.signal.aborted) {
        close();
        return;
      }

      // Subscribe first so the snapshot cannot lose a terminal transition.
      void taskStore.getTaskMetadata(taskId).then(task => {
        if (closed) return;
        if (!task) {
          close();
          return;
        }
        if (TERMINAL_TASK_STATUSES.has(task.status)) onTask(task);
        else send(task, 'connected');
      }).catch(() => close());
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
