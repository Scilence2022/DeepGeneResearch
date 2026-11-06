import { admitResearchRequest } from '@/app/api/mcp/admission';
import { NextResponse, type NextRequest } from 'next/server';
import { authenticateResearch } from '../../mcp/auth';
import { streamResearch } from '../stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export function GET(request: NextRequest) {
  const principal = authenticateResearch(request);
  if (principal instanceof NextResponse) return principal;
  const limited = admitResearchRequest(principal.workspaceId);
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const maxResult = params.get('maxResult');
  const booleanOption = (name: string) => {
    const value = params.get(name);
    if (value === null) return undefined;
    if (value === 'true' || value === 'false') return value === 'true';
    return value;
  };
  return streamResearch(request, {
    query: params.get('query'),
    provider: params.get('provider') ?? undefined,
    thinkingModel: params.get('thinkingModel') ?? undefined,
    taskModel: params.get('taskModel') ?? undefined,
    searchProvider: params.get('searchProvider') ?? undefined,
    language: params.get('language') ?? undefined,
    maxResult: maxResult === null ? undefined : Number(maxResult),
    enableCitationImage: booleanOption('enableCitationImage'),
    enableReferences: booleanOption('enableReferences'),
  }, true, principal.workspaceId);
}
