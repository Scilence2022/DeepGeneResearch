import { NextRequest, NextResponse } from 'next/server';
import { taskQueue } from '@/services/task-queue';

// GET /api/mcp/tasks/[taskId]/progress - 实时进度通知
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  // 设置 SSE 响应头
  const response = new NextResponse(null, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });

  // 为响应对象添加一个自定义的 writer 属性
  const writer = response.writable;

  // 发送初始消息
  const sendMessage = (data: any) => {
    if (writer && !writer.locked) {
      writer.write(`data: ${JSON.stringify(data)}

`);
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
      // 任务完成后关闭连接
      if (writer) {
        writer.close();
      }
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
      // 任务失败后关闭连接
      if (writer) {
        writer.close();
      }
    }
  };

  // 注册事件监听器
  taskQueue.on('task:progress', progressHandler);
  taskQueue.on('task:completed', completedHandler);
  taskQueue.on('task:failed', failedHandler);

  // 处理连接关闭
  request.signal.addEventListener('abort', () => {
    // 移除事件监听器
    taskQueue.off('task:progress', progressHandler);
    taskQueue.off('task:completed', completedHandler);
    taskQueue.off('task:failed', failedHandler);
    // 关闭 writer
    if (writer) {
      writer.close();
    }
  });

  // 发送连接确认消息
  sendMessage({
    type: 'connected',
    message: `Connected to task ${taskId} progress updates`,
    timestamp: new Date().toISOString(),
  });

  return response;
}
