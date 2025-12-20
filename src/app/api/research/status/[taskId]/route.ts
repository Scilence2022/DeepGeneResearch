import { NextRequest, NextResponse } from 'next/server';
import { useHistoryStore } from '@/store/history';
import { isValidTaskId } from '@/utils/task-id-generator';

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    const { taskId } = params;
    
    // Validate taskId format
    if (!isValidTaskId(taskId)) {
      return NextResponse.json(
        { error: 'Invalid task ID format' },
        { status: 400 }
      );
    }
    
    // Get the task from history store
    const task = useHistoryStore.getState().getTask(taskId);
    
    if (!task) {
      return NextResponse.json(
        { error: 'Task not found' },
        { status: 404 }
      );
    }
    
    // Return task status
    return NextResponse.json({
      taskId: task.id,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      progress: task.progress,
      config: task.config
    });
    
  } catch (error) {
    console.error('Error getting task status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get task status' },
      { status: 500 }
    );
  }
}
