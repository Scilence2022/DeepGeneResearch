import { NextResponse, type NextRequest } from 'next/server';
import { requireMcpAuth } from '../mcp/auth';
import { readBoundedJson, RequestBodyError } from '@/utils/request-json';
import { streamResearch } from './stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const unauthorized = requireMcpAuth(request);
  if (unauthorized) return unauthorized;

  try {
    return streamResearch(request, await readBoundedJson(request, 32 * 1024));
  } catch (error) {
    const status = error instanceof RequestBodyError ? error.status : 500;
    return NextResponse.json({ error: status < 500 && error instanceof Error ? error.message : 'Unable to start research' }, { status });
  }
}
