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
  const existingTask = await taskStore.getTask(taskId);

  if (!existingTask) {
    return NextResponse.json(
      { error: `Task ${taskId} not found` },
      { status: 404 }
    );
  }

  // 使用 ReadableStream 实现 SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      
      const sendMessage = (data: any) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch (e) {
          // Connection might be closed
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
            updatedAt: new Date().toISOString(),
          });
          controller.close();
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
            updatedAt: new Date().toISOString(),
          });
          controller.close();
        }
      };

      // 注册事件监听器
      taskQueue.on('task:progress', progressHandler);
      taskQueue.on('task:completed', completedHandler);
      taskQueue.on('task:failed', failedHandler);

      // 处理连接关闭
      request.signal.addEventListener('abort', () => {
        taskQueue.off('task:progress', progressHandler);
        taskQueue.off('task:completed', completedHandler);
        taskQueue.off('task:failed', failedHandler);
        try {
          controller.close();
        } catch (e) {
          // Already closed
        }
      });

      // 发送连接确认消息
      sendMessage({
        type: 'connected',
        message: `Connected to task ${taskId} progress updates`,
        task: existingTask,
        timestamp: new Date().toISOString(),
      });
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
