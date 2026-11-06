import { admitResearchRequest } from '@/app/api/mcp/admission';
import { NextResponse, type NextRequest } from 'next/server';
import { authenticateResearch } from '../auth';
import { ensureTaskLedgerOwnership } from '@/services/task-store';
import {
  MAX_RESEARCH_DOCUMENT_BYTES,
  ResearchDocumentQuotaError,
  storeResearchDocument,
} from '@/services/research-document-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const uploading = new Set<string>();

async function readBoundedBody(request: NextRequest): Promise<Buffer> {
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESEARCH_DOCUMENT_BYTES) {
        await reader.cancel('research-document-too-large').catch(() => undefined);
        throw new Error('Research PDF exceeds the upload limit');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export async function POST(request: NextRequest) {
  const principal = authenticateResearch(request);
  if (principal instanceof NextResponse) return principal;
  const limited = admitResearchRequest(principal.workspaceId);
  if (limited) return limited;

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESEARCH_DOCUMENT_BYTES) {
    return NextResponse.json({ error: 'Research PDF exceeds the upload limit' }, { status: 413 });
  }
  const mediaType = String(request.headers.get('content-type') || '').split(';', 1)[0].trim().toLowerCase();
  const encodedName = request.headers.get('x-dgr-document-name') || '';
  let name: string;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    return NextResponse.json({ error: 'Research document name encoding is invalid' }, { status: 400 });
  }

  const workspace = principal.workspaceId ?? '';
  try {
    await ensureTaskLedgerOwnership();
  } catch {
    return NextResponse.json({ error: 'Research document storage unavailable' }, { status: 503 });
  }
  if (uploading.size >= 4 || uploading.has(workspace)) {
    return NextResponse.json({ error: 'Research PDF upload capacity reached' }, { status: 429 });
  }
  uploading.add(workspace);
  try {
    const bytes = await readBoundedBody(request);
    const document = await storeResearchDocument({ bytes, name, mediaType }, principal.workspaceId);
    return NextResponse.json({ document });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research document upload failed';
    return NextResponse.json(
      { error: message },
      { status: error instanceof ResearchDocumentQuotaError ? 429 : message === 'Research PDF exceeds the upload limit' ? 413 : 400 },
    );
  } finally {
    uploading.delete(workspace);
  }
}
