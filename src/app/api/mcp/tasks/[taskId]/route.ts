import { NextRequest, NextResponse } from 'next/server';
import { taskStore } from '@/services/task-store';
import { taskQueue } from '@/services/task-queue';

// GET /api/mcp/tasks/[taskId] - 获取单个任务
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const task = await taskStore.getTask(taskId);
    
    if (!task) {
      return NextResponse.json(
        { error: `Task ${taskId} not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json(task);
  } catch (error) {
    console.error(`Error getting task ${params.taskId}:`, error);
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
  try {
    const { taskId } = await params;
    
    // 尝试从队列中取消任务
    const canceledFromQueue = taskQueue.cancelTask(taskId);
    
    // 从存储中删除任务
    const deleted = await taskStore.deleteTask(taskId);
    
    if (!deleted && !canceledFromQueue) {
      return NextResponse.json(
        { error: `Task ${taskId} not found` },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true, message: `Task ${taskId} deleted` });
  } catch (error) {
    console.error(`Error deleting task ${params.taskId}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
