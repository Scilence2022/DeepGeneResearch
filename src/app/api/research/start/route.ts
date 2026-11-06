import { admitResearchRequest } from '@/app/api/mcp/admission';
import { NextRequest, NextResponse } from 'next/server';
import { authenticateResearch } from '../../mcp/auth';
import { TaskValidationError, taskQueue } from '@/services/task-queue';
import { IdempotencyConflictError, TaskCapacityError } from '@/services/task-store';
import { readBoundedJson, RequestBodyError } from '@/utils/request-json';
import { legacyStatus, privateResponse, researchOptions } from '../shared';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const principal = authenticateResearch(request);
  if (principal instanceof NextResponse) return principal;
  const limited = admitResearchRequest(principal.workspaceId);
  if (limited) return limited;

  try {
    const parsed = researchOptions.safeParse(await readBoundedJson(request, 32 * 1024));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid research options', issues: parsed.error.issues }, { status: 400 });
    }
    const task = await taskQueue.addTask({
      mode: 'general',
      ...parsed.data,
      idempotencyKey: request.headers.get('idempotency-key') || undefined,
    }, principal.workspaceId);
    return NextResponse.json({
      taskId: task.id,
      status: legacyStatus(task.status),
      createdAt: task.createdAt,
      message: 'Research task accepted',
    }, { headers: privateResponse });
  } catch (error) {
    if (error instanceof RequestBodyError || error instanceof TaskValidationError || error instanceof IdempotencyConflictError) {
      const status = error instanceof RequestBodyError ? error.status : error instanceof IdempotencyConflictError ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof TaskCapacityError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { 'Retry-After': '10' } });
    }
    console.error('[Research] Unable to submit task', error instanceof Error ? error.name : 'UnknownError');
    return NextResponse.json({ error: 'Research queue unavailable' }, { status: 503 });
  }
}
