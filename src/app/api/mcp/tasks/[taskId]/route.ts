import { NextRequest, NextResponse } from 'next/server';
import { taskStore } from '@/services/task-store';
import { taskQueue } from '@/services/task-queue';
import { requireMcpAuth } from '../../auth';
import { projectTaskResult, type TaskResultMode } from '@/services/task-result-projection';

// GET /api/mcp/tasks/[taskId] - 获取单个任务
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const unauthorized = requireMcpAuth(request);
  if (unauthorized) return unauthorized;

  const { taskId } = await params;
  try {
    await taskQueue.start();
    const task = await taskStore.getTask(taskId);
    
    if (!task) {
      return NextResponse.json(
        { error: `Task ${taskId} not found` },
        { status: 404 }
      );
    }
    
    const requestedMode = request.nextUrl.searchParams.get('resultMode') || 'full';
    if (requestedMode !== 'full' && requestedMode !== 'annotation') {
      return NextResponse.json(
        { error: 'resultMode must be full or annotation' },
        { status: 400 }
      );
    }
    const resultMode = requestedMode as TaskResultMode;
    return NextResponse.json({
      ...task,
      resultMode,
      result: projectTaskResult(task.result, resultMode),
    });
  } catch (error) {
    console.error(`Error getting task ${taskId}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/mcp/tasks/[taskId] - 删除任务
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const unauthorized = requireMcpAuth(request);
  if (unauthorized) return unauthorized;

  const { taskId } = await params;
  try {
    // DELETE is a cancellation request, not destructive task deletion. Keeping
    // the terminal record is required for audit and client restart recovery.
    const canceledFromQueue = await taskQueue.cancelTask(taskId);
    if (!canceledFromQueue) {
      return NextResponse.json(
        { error: `Task ${taskId} cannot be cancelled` },
        { status: 404 }
      );
    }

    const task = await taskStore.getTask(taskId);
    return NextResponse.json({ success: true, status: task?.status || 'cancel_requested', message: `Cancellation requested for task ${taskId}` });
  } catch (error) {
    console.error(`Error deleting task ${taskId}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
