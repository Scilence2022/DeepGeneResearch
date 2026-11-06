import { admitResearchRequest } from '@/app/api/mcp/admission';
import { NextResponse, type NextRequest } from 'next/server';
import { authenticateResearch } from '../mcp/auth';
import { readBoundedJson, RequestBodyError } from '@/utils/request-json';
import { streamResearch } from './stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const principal = authenticateResearch(request);
  if (principal instanceof NextResponse) return principal;
  const limited = admitResearchRequest(principal.workspaceId);
  if (limited) return limited;

  try {
    return streamResearch(request, await readBoundedJson(request, 32 * 1024), false, principal.workspaceId);
  } catch (error) {
    const status = error instanceof RequestBodyError ? error.status : 500;
    return NextResponse.json({ error: status < 500 && error instanceof Error ? error.message : 'Unable to start research' }, { status });
  }
}
