import { NextRequest, NextResponse } from 'next/server';
import { taskQueue } from '@/services/task-queue';
import { taskStore } from '@/services/task-store';
import { requireMcpAuth } from '../../../auth';

// GET /api/mcp/tasks/[taskId]/progress - 实时进度通知
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const unauthorized = requireMcpAuth(request);
  if (unauthorized) return unauthorized;

  const { taskId } = await params;
  await taskQueue.start();
  const existingTask = await taskStore.getTask(taskId);

  if (!existingTask) {
    return NextResponse.json(
      { error: `Task ${taskId} not found` },
      { status: 404 }
    );
  }

  // 使用 ReadableStream 实现 SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      
      const sendMessage = (data: any) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          // Connection might be closed
        }
      };

      const cleanup = () => {
        taskQueue.off('task:progress', progressHandler);
        taskQueue.off('task:completed', completedHandler);
        taskQueue.off('task:failed', failedHandler);
        taskQueue.off('task:cancelled', cancelledHandler);
      };

      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // Stream may already have been closed by the client.
        }
      };

      // 监听任务进度事件
      const progressHandler = (task: any, progress: number, step: string) => {
        if (task.id === taskId) {
          sendMessage({
            type: 'progress',
            taskId: task.id,
            progress,
            step,
            status: task.status,
            eventSeq: task.eventSeq,
            updatedAt: new Date().toISOString(),
          });
        }
      };

      // 监听任务完成事件
      const completedHandler = (task: any, result: any) => {
        if (task.id === taskId) {
          sendMessage({
            type: 'completed',
            taskId: task.id,
            status: 'completed',
            progress: 100,
            result,
            eventSeq: task.eventSeq,
            updatedAt: new Date().toISOString(),
          });
          close();
        }
      };

      // 监听任务失败事件
      const failedHandler = (task: any, error: string) => {
        if (task.id === taskId) {
          sendMessage({
            type: 'failed',
            taskId: task.id,
            status: 'failed',
            error,
            eventSeq: task.eventSeq,
            updatedAt: new Date().toISOString(),
          });
          close();
        }
      };

      const cancelledHandler = (task: any) => {
        if (task.id === taskId) {
          sendMessage({
            type: 'cancelled',
            taskId: task.id,
            status: 'cancelled',
            progress: task.progress,
            step: task.step,
            eventSeq: task.eventSeq,
            updatedAt: new Date().toISOString(),
          });
          close();
        }
      };

      // 注册事件监听器
      taskQueue.on('task:progress', progressHandler);
      taskQueue.on('task:completed', completedHandler);
      taskQueue.on('task:failed', failedHandler);
      taskQueue.on('task:cancelled', cancelledHandler);

      // 处理连接关闭
      request.signal.addEventListener('abort', () => {
        close();
      });

      // Re-read only after listeners are installed so a terminal transition
      // cannot be lost between the initial existence check and subscription.
      const currentTask = await taskStore.getTask(taskId);
      if (!currentTask || closed) return;

      // 发送连接确认消息
      sendMessage({
        type: 'connected',
        message: `Connected to task ${taskId} progress updates`,
        task: currentTask,
        timestamp: new Date().toISOString(),
      });

      if (currentTask.status === 'completed') {
        completedHandler(currentTask, currentTask.result);
      } else if (currentTask.status === 'failed') {
        failedHandler(currentTask, currentTask.error || 'Research task failed');
      } else if (currentTask.status === 'cancelled') {
        cancelledHandler(currentTask);
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
