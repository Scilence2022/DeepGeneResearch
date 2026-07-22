import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('research document store', () => {
  let storageDir: string;

  beforeEach(async () => {
    storageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dgr-research-documents-'));
    vi.stubEnv('MCP_RESEARCH_DOCUMENT_STORAGE_DIR', storageDir);
    vi.resetModules();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.rm(storageDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('stores and reloads an idempotent content-addressed PDF with private permissions', async () => {
    const { loadResearchDocument, storeResearchDocument } = await import('./research-document-store');
    const bytes = Buffer.from('%PDF-1.4\nfull text fixture\n%%EOF\n');

    const first = await storeResearchDocument({ bytes, name: '../paper.pdf', mediaType: 'application/pdf' });
    const duplicate = await storeResearchDocument({ bytes, name: 'renamed.pdf', mediaType: 'application/pdf' });
    const loaded = await loadResearchDocument(first.documentId);

    expect(first.documentId).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.name).toBe('paper.pdf');
    expect(duplicate.documentId).toBe(first.documentId);
    expect(duplicate.name).toBe(first.name);
    expect(loaded.bytes).toEqual(bytes);
    expect(loaded.descriptor.documentId).toBe(first.documentId);
    expect((await fs.stat(storageDir)).mode & 0o777).toBe(0o700);
    expect((await fs.stat(path.join(storageDir, `${first.sha256}.pdf`))).mode & 0o777).toBe(0o600);
  });

  it('rejects non-PDF bytes before writing any document', async () => {
    const { storeResearchDocument } = await import('./research-document-store');
    await expect(
      storeResearchDocument({ bytes: Buffer.from('not a pdf'), name: 'paper.pdf', mediaType: 'application/pdf' })
    ).rejects.toThrow('not a valid PDF');
    expect(await fs.readdir(storageDir)).toEqual([]);
  });

  it('fails closed on production ephemeral runtimes', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const { storeResearchDocument } = await import('./research-document-store');

    await expect(
      storeResearchDocument({
        bytes: Buffer.from('%PDF-1.4\nfixture\n%%EOF\n'),
        name: 'paper.pdf',
        mediaType: 'application/pdf',
      })
    ).rejects.toThrow('unavailable on an ephemeral runtime');
  });
});
