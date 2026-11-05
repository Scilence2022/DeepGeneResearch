import { NextRequest, NextResponse } from 'next/server';
import { IdempotencyConflictError, TaskCapacityError, taskStore } from '@/services/task-store';
import { TaskValidationError, taskQueue } from '@/services/task-queue';
import { readBoundedJson, RequestBodyError } from '@/utils/request-json';
import { requireMcpAuth } from '../auth';
import { geneResearchRequest } from '../task-parameters';

export async function GET(request: NextRequest) {
  const unauthorized = requireMcpAuth(request);
  if (unauthorized) return unauthorized;

  const params = request.nextUrl.searchParams;
  const offset = Number(params.get('offset') ?? '0');
  const limit = Number(params.get('limit') ?? '50');
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ error: 'offset must be non-negative and limit must be between 1 and 100' }, { status: 400 });
  }

  try {
    await taskQueue.start();
    const { tasks, total } = await taskStore.listTasks(offset, limit, params.get('includeResult') === 'true');
    return NextResponse.json(tasks, { headers: { 'Cache-Control': 'private, no-store', 'X-Total-Count': String(total) } });
  } catch {
    return NextResponse.json({ error: 'Research task store unavailable' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireMcpAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const parsed = geneResearchRequest.safeParse(await readBoundedJson(request, 1024 * 1024));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid gene research options', issues: parsed.error.issues }, { status: 400 });
    }
    const task = await taskQueue.addTask(parsed.data);
    return NextResponse.json(task, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof RequestBodyError || error instanceof TaskValidationError || error instanceof IdempotencyConflictError) {
      const status = error instanceof RequestBodyError ? error.status : error instanceof IdempotencyConflictError ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    if (error instanceof TaskCapacityError) {
      return NextResponse.json({ error: error.message }, { status: 429, headers: { 'Retry-After': '10' } });
    }
    return NextResponse.json({ error: 'Research queue unavailable' }, { status: 503 });
  }
}
