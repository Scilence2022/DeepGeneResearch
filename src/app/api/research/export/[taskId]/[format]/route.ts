import { NextRequest, NextResponse } from 'next/server';
import { authenticateResearch } from '../../../../mcp/auth';
import { privateResponse, readGeneralTask } from '../../../shared';

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string; format: string }> }) {
  const principal = authenticateResearch(request);
  if (principal instanceof NextResponse) return principal;

  try {
    const { taskId, format } = await params;
    if (format.toLowerCase() !== 'markdown') {
      return NextResponse.json({ error: 'Unsupported export format', supportedFormats: ['markdown'] }, { status: 400 });
    }
    const task = await readGeneralTask(taskId, principal.workspaceId, true);
    if (task instanceof NextResponse) return task;
    if (task.status !== 'completed' || typeof task.result?.finalReport !== 'string') {
      return NextResponse.json({ error: 'Research report unavailable', status: task.status }, { status: 409 });
    }
    return new NextResponse(task.result.finalReport, {
      headers: {
        ...privateResponse,
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `attachment; filename="research-${task.id}.md"`,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Research task store unavailable' }, { status: 503 });
  }
}
