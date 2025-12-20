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
    
    if (task.status !== 'completed') {
      return NextResponse.json({
        taskId: task.id,
        status: task.status,
        message: `Task is not completed yet. Current status: ${task.status}`,
        progress: task.progress
      }, { status: 202 });
    }
    
    if (!task.result) {
      return NextResponse.json(
        { error: 'Task result not found' },
        { status: 404 }
      );
    }
    
    // Generate download links for different formats
    const downloadLinks = {
      markdown: `/api/research/export/${taskId}/markdown`,
      pdf: `/api/research/export/${taskId}/pdf`,
      docx: `/api/research/export/${taskId}/docx`
    };
    
    // Return task result with download links
    return NextResponse.json({
      taskId: task.id,
      status: task.status,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      result: task.result,
      downloadLinks
    });
    
  } catch (error) {
    console.error('Error getting task result:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get task result' },
      { status: 500 }
    );
  }
}
