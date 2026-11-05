import { NextRequest, NextResponse } from 'next/server';
import { requireMcpAuth } from '../../../mcp/auth';
import { legacyStatus, privateResponse, readGeneralTask } from '../../shared';
import { taskQueue } from '@/services/task-queue';

type Context = { params: Promise<{ taskId: string }> };

export async function GET(request: NextRequest, { params }: Context) {
  const unauthorized = requireMcpAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const task = await readGeneralTask((await params).taskId);
    if (task instanceof NextResponse) return task;
    const { language, maxResult, enableCitationImage, enableReferences } = task.parameters;
    return NextResponse.json({
      taskId: task.id,
      status: legacyStatus(task.status),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      eventSeq: task.eventSeq,
      progress: { step: task.step, percent: task.progress },
      config: { language, maxResult, enableCitationImage, enableReferences },
    }, { headers: privateResponse });
  } catch {
    return NextResponse.json({ error: 'Research task store unavailable' }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const unauthorized = requireMcpAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const task = await readGeneralTask((await params).taskId);
    if (task instanceof NextResponse) return task;
    const requested = await taskQueue.cancelTask(task.id);
    const latest = await readGeneralTask(task.id);
    if (latest instanceof NextResponse) return latest;
    return NextResponse.json({ taskId: task.id, status: legacyStatus(latest.status), requested }, { headers: privateResponse });
  } catch {
    return NextResponse.json({ error: 'Research task store unavailable' }, { status: 503 });
  }
}
