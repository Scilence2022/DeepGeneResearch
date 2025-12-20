import { NextRequest, NextResponse } from 'next/server';
import { useHistoryStore } from '@/store/history';
import { isValidTaskId } from '@/utils/task-id-generator';

export async function GET(
  req: NextRequest,
  { params }: { params: { taskId: string; format: string } }
) {
  try {
    const { taskId, format } = params;
    
    // Validate taskId format
    if (!isValidTaskId(taskId)) {
      return NextResponse.json(
        { error: 'Invalid task ID format' },
        { status: 400 }
      );
    }
    
    // Validate format
    const validFormats = ['markdown', 'pdf', 'docx'];
    if (!validFormats.includes(format.toLowerCase())) {
      return NextResponse.json(
        { error: `Invalid format. Supported formats: ${validFormats.join(', ')}` },
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
    
    if (task.status !== 'completed' || !task.result) {
      return NextResponse.json(
        { error: 'Task not completed or result not available' },
        { status: 400 }
      );
    }
    
    const lowerFormat = format.toLowerCase();
    let content: string;
    let contentType: string;
    let filename: string;
    
    // Generate content based on format
    switch (lowerFormat) {
      case 'markdown':
        content = task.result.finalReport || '';
        contentType = 'text/markdown; charset=utf-8';
        filename = `${task.result.title || 'research-report'}.md`;
        break;
        
      case 'pdf':
        // PDF generation will be implemented later
        // For now, return a placeholder
        content = '# PDF Export Not Implemented Yet\n\nPlease use Markdown format for now. PDF export will be available soon.';
        contentType = 'text/markdown; charset=utf-8';
        filename = `${task.result.title || 'research-report'}-placeholder.md`;
        break;
        
      case 'docx':
        // DOCX generation will be implemented later
        // For now, return a placeholder
        content = '# DOCX Export Not Implemented Yet\n\nPlease use Markdown format for now. DOCX export will be available soon.';
        contentType = 'text/markdown; charset=utf-8';
        filename = `${task.result.title || 'research-report'}-placeholder.md`;
        break;
        
      default:
        return NextResponse.json(
          { error: 'Unsupported format' },
          { status: 400 }
        );
    }
    
    if (!content) {
      return NextResponse.json(
        { error: 'No content available for export' },
        { status: 404 }
      );
    }
    
    // Sanitize filename to remove special characters
    filename = filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    
    // Return the file as response
    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': Buffer.byteLength(content, 'utf-8').toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
    
  } catch (error) {
    console.error('Error exporting research report:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export research report' },
      { status: 500 }
    );
  }
}
