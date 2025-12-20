import { NextRequest, NextResponse } from 'next/server';
import DeepResearch from '@/utils/deep-research';
import { useHistoryStore } from '@/store/history';
import { getAIProviderBaseURL, getAIProviderApiKey, getSearchProviderBaseURL, getSearchProviderApiKey } from '../../utils';

const AI_PROVIDER = process.env.MCP_AI_PROVIDER || '';
const SEARCH_PROVIDER = process.env.MCP_SEARCH_PROVIDER || 'model';
const THINKING_MODEL = process.env.MCP_THINKING_MODEL || '';
const TASK_MODEL = process.env.MCP_TASK_MODEL || '';

interface StartResearchRequest {
  query: string;
  language?: string;
  enableCitationImage?: boolean;
  enableReferences?: boolean;
  maxResult?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: StartResearchRequest = await req.json();
    
    // Validate required fields
    if (!body.query || body.query.trim() === '') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }
    
    // Get the history store
    const historyStore = useHistoryStore.getState();
    
    // Create a new research task
    const taskId = historyStore.createTask({
      query: body.query,
      status: 'in-progress',
      config: {
        language: body.language || 'English',
        enableCitationImage: body.enableCitationImage ?? true,
        enableReferences: body.enableReferences ?? true,
        maxResult: body.maxResult ?? 5
      }
    });
    
    // Initialize DeepResearch instance
    const deepResearch = new DeepResearch({
      AIProvider: {
        baseURL: getAIProviderBaseURL(AI_PROVIDER),
        apiKey: getAIProviderApiKey(AI_PROVIDER),
        provider: AI_PROVIDER,
        thinkingModel: THINKING_MODEL,
        taskModel: TASK_MODEL,
      },
      searchProvider: {
        baseURL: getSearchProviderBaseURL(SEARCH_PROVIDER),
        apiKey: getSearchProviderApiKey(SEARCH_PROVIDER),
        provider: SEARCH_PROVIDER,
        maxResult: body.maxResult ?? 5,
      },
      language: body.language || 'English',
      onMessage: (event, data) => {
        // Update task status when receiving progress updates
        if (event === 'task-status') {
          historyStore.updateTaskStatus(
            taskId, 
            data.status, 
            data
          );
        } else if (event === 'progress') {
          historyStore.updateTaskStatus(
            taskId, 
            'in-progress',
            data
          );
        } else if (event === 'error') {
          historyStore.updateTaskStatus(
            taskId, 
            'failed',
            { error: data.message }
          );
        }
      },
    });
    
    // Start research asynchronously
    deepResearch.start(
      body.query,
      body.enableCitationImage ?? true,
      body.enableReferences ?? true,
      taskId
    ).then((result) => {
      // Update task with result when completed
      historyStore.updateTaskResult(taskId, result);
    }).catch((error) => {
      // Update task with error when failed
      historyStore.updateTaskStatus(
        taskId, 
        'failed',
        { error: error.message }
      );
    });
    
    // Return taskId to client
    return NextResponse.json({
      taskId,
      status: 'in-progress',
      createdAt: new Date().toISOString(),
      message: 'Research task started successfully'
    });
    
  } catch (error) {
    console.error('Error starting research task:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to start research task' },
      { status: 500 }
    );
  }
}
