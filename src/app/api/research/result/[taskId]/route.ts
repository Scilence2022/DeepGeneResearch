import { NextRequest, NextResponse } from 'next/server';
import { authenticateResearch } from '../../../mcp/auth';
import { legacyStatus, privateResponse, readGeneralTask } from '../../shared';
import { TERMINAL_TASK_STATUSES } from '@/models/task';

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const principal = authenticateResearch(request);
  if (principal instanceof NextResponse) return principal;

  try {
    const task = await readGeneralTask((await params).taskId, principal.workspaceId, true);
    if (task instanceof NextResponse) return task;
    const summary = {
      taskId: task.id,
      status: legacyStatus(task.status),
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };
    if (task.status !== 'completed') {
      return NextResponse.json({ ...summary, progress: task.progress, step: task.step, error: task.error },
        { status: TERMINAL_TASK_STATUSES.has(task.status) ? 200 : 202, headers: privateResponse });
    }
    return NextResponse.json({
      ...summary,
      result: task.result,
      downloadLinks: { markdown: `/api/research/export/${task.id}/markdown` },
    }, { headers: privateResponse });
  } catch {
    return NextResponse.json({ error: 'Research task store unavailable' }, { status: 503 });
  }
}
