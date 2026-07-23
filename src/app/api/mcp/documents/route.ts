import { NextResponse, type NextRequest } from 'next/server';
import { requireMcpAuth } from '../auth';
import {
  MAX_RESEARCH_DOCUMENT_BYTES,
  storeResearchDocument,
} from '@/services/research-document-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const unauthorized = requireMcpAuth(request);
  if (unauthorized) return unauthorized;

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

  try {
    const bytes = await readBoundedBody(request);
    const document = await storeResearchDocument({ bytes, name, mediaType });
    return NextResponse.json({ document });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Research document upload failed';
    return NextResponse.json(
      { error: message },
      { status: message === 'Research PDF exceeds the upload limit' ? 413 : 400 },
    );
  }
}
