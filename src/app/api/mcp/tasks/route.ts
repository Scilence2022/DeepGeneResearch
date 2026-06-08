import { NextRequest, NextResponse } from 'next/server';
import { taskStore } from '@/services/task-store';
import { taskQueue } from '@/services/task-queue';
import { GeneResearchParameters } from '@/models/task';
import { requireMcpAuth } from '../auth';

// GET /api/mcp/tasks - 列出所有任务
export async function GET(request: NextRequest) {
  const unauthorized = requireMcpAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const tasks = await taskStore.getAllTasks();
    return NextResponse.json(tasks);
  } catch (error) {
    console.error('Error getting tasks:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/mcp/tasks - 创建新任务
export async function POST(request: NextRequest) {
  const unauthorized = requireMcpAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const parameters: GeneResearchParameters = await request.json();
    
    // 验证必要参数
    if (!parameters.geneSymbol || !parameters.organism) {
      return NextResponse.json(
        { error: 'geneSymbol and organism are required' },
        { status: 400 }
      );
    }

    const task = await taskQueue.addTask(parameters);
    return NextResponse.json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
