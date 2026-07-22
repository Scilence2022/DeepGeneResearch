import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';

export const MAX_RESEARCH_DOCUMENT_BYTES = 20 * 1024 * 1024;
export const MAX_RESEARCH_DOCUMENTS_PER_TASK = 8;

export interface ResearchDocumentDescriptor {
  documentId: string;
  name: string;
  mediaType: 'application/pdf';
  size: number;
  sha256: string;
  uploadedAt: string;
  origin: 'user_upload';
}

const STORAGE_DIR = process.env.MCP_RESEARCH_DOCUMENT_STORAGE_DIR
  ? path.resolve(process.env.MCP_RESEARCH_DOCUMENT_STORAGE_DIR)
  : path.join(process.cwd(), '.dgr-research-documents');

function assertSupportedStorageRuntime(): void {
  const ephemeral = Boolean(process.env.VERCEL || process.env.CF_PAGES);
  const developmentOverride = process.env.DGR_ALLOW_EPHEMERAL_TASK_STORAGE === 'true'
    && process.env.NODE_ENV !== 'production';
  if (ephemeral && !developmentOverride) {
    throw new Error(
      'Research PDF storage is unavailable on an ephemeral runtime; use the long-lived durable DGR worker',
    );
  }
}

function documentHashFromId(documentId: string): string {
  const match = String(documentId || '').match(/^sha256:([a-f0-9]{64})$/i);
  if (!match) throw new Error('Research document id must be a sha256 content identifier');
  return match[1].toLowerCase();
}

function safeDocumentName(value: string): string {
  const name = path.basename(String(value || '').normalize('NFC').trim());
  if (!name || name.length > 255 || /[\0\r\n]/.test(name)) {
    throw new Error('Research document name is invalid');
  }
  return name;
}

function assertPdf(bytes: Buffer, mediaType: string): void {
  if (mediaType !== 'application/pdf') {
    throw new Error('Only application/pdf research documents are supported');
  }
  if (bytes.length < 8 || bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new Error('Research document content is not a valid PDF file');
  }
}

async function durableWrite(filePath: string, contents: Buffer | string): Promise<void> {
  await fs.mkdir(STORAGE_DIR, { recursive: true, mode: 0o700 });
  await fs.chmod(STORAGE_DIR, 0o700);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const handle = await fs.open(tempPath, 'wx', 0o600);
  let renamed = false;
  try {
    await handle.writeFile(contents);
    await handle.sync();
    await handle.close();
    await fs.rename(tempPath, filePath);
    renamed = true;
  } finally {
    await handle.close().catch(() => undefined);
    if (!renamed) await fs.rm(tempPath, { force: true }).catch(() => undefined);
  }
}

export async function storeResearchDocument(input: {
  bytes: Buffer;
  name: string;
  mediaType: string;
}): Promise<ResearchDocumentDescriptor> {
  assertSupportedStorageRuntime();
  const name = safeDocumentName(input.name);
  const bytes = Buffer.from(input.bytes);
  if (bytes.length === 0 || bytes.length > MAX_RESEARCH_DOCUMENT_BYTES) {
    throw new Error(`Research PDF must be between 1 byte and ${MAX_RESEARCH_DOCUMENT_BYTES} bytes`);
  }
  assertPdf(bytes, input.mediaType);

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const descriptor: ResearchDocumentDescriptor = {
    documentId: `sha256:${sha256}`,
    name,
    mediaType: 'application/pdf',
    size: bytes.length,
    sha256,
    uploadedAt: new Date().toISOString(),
    origin: 'user_upload',
  };
  const pdfPath = path.join(STORAGE_DIR, `${sha256}.pdf`);
  const metadataPath = path.join(STORAGE_DIR, `${sha256}.json`);

  await fs.mkdir(STORAGE_DIR, { recursive: true, mode: 0o700 });
  await fs.chmod(STORAGE_DIR, 0o700);
  let pdfAlreadyStored = false;
  try {
    const existing = await fs.readFile(pdfPath);
    if (createHash('sha256').update(existing).digest('hex') !== sha256) {
      throw new Error(`Stored research document failed integrity verification: ${sha256}`);
    }
    pdfAlreadyStored = true;
    try {
      const existingDescriptor = JSON.parse(await fs.readFile(metadataPath, 'utf8')) as ResearchDocumentDescriptor;
      if (
        existingDescriptor.documentId !== descriptor.documentId
        || existingDescriptor.sha256 !== sha256
        || existingDescriptor.size !== existing.length
        || existingDescriptor.mediaType !== 'application/pdf'
      ) {
        throw new Error(`Stored research document metadata failed integrity verification: ${sha256}`);
      }
      return existingDescriptor;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!pdfAlreadyStored) await durableWrite(pdfPath, bytes);
  await durableWrite(metadataPath, JSON.stringify(descriptor, null, 2));
  return descriptor;
}

export async function loadResearchDocument(documentId: string): Promise<{
  descriptor: ResearchDocumentDescriptor;
  bytes: Buffer;
}> {
  assertSupportedStorageRuntime();
  const sha256 = documentHashFromId(documentId);
  const pdfPath = path.join(STORAGE_DIR, `${sha256}.pdf`);
  const metadataPath = path.join(STORAGE_DIR, `${sha256}.json`);
  const [bytes, metadataText] = await Promise.all([
    fs.readFile(pdfPath),
    fs.readFile(metadataPath, 'utf8'),
  ]);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== sha256) throw new Error(`Research document integrity check failed: ${documentId}`);
  const descriptor = JSON.parse(metadataText) as ResearchDocumentDescriptor;
  if (descriptor.sha256 !== sha256 || descriptor.documentId !== documentId) {
    throw new Error(`Research document metadata does not match its content: ${documentId}`);
  }
  assertPdf(bytes, descriptor.mediaType);
  return { descriptor, bytes };
}
