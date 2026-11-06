import { Worker } from 'node:worker_threads';
import { researchBudget } from '@/services/research-run-budget';
import { pdfWorkerSource } from './pdf-worker-source';
import { createHash } from 'crypto';
import {
  FULL_TEXT_CANONICALIZATION,
  FULL_TEXT_OFFSET_ENCODING,
  MAX_FULL_TEXT_CHARACTERS,
  canonicalizeFullText,
  type FullTextDocument,
  type FullTextOrigin,
  type FullTextPage,
} from '@/utils/gene-research/full-text';

export interface PdfSegmentInput {
  signal?: AbortSignal;
  bytes: Uint8Array;
  name: string;
  mediaType?: string;
  /** sha256 of the original bytes, hex-encoded. */
  documentSha256?: string;
  retrievedAt?: string;
  origin?: Extract<FullTextOrigin, 'user_upload' | 'pdf'>;
  sourceUrl?: string;
  identifiers?: { pmid?: string; doi?: string; pmcid?: string };
}

/**
 * Shared PDF segmentation: pdfjs text extraction -> FullTextDocument with a
 * page map and UTF-16 offsets. Used both for user-uploaded PDFs
 * (gene-research/full-text.ts) and for acquired OA PDF copies (Unpaywall,
 * CORE, OpenAlex fallbacks).
 */
export async function segmentPdfDocument(input: PdfSegmentInput): Promise<FullTextDocument> {
  const signal = input.signal
    ? AbortSignal.any([input.signal, AbortSignal.timeout(25_000)])
    : AbortSignal.timeout(25_000);
  signal.throwIfAborted();
  const budget = researchBudget();
  const rawPages = await new Promise<string[]>((resolve, reject) => {
    const worker = new Worker(pdfWorkerSource, {
      eval: true,
      workerData: {
        bytes: input.bytes,
        pageLimit: Math.min(500, budget?.remaining('parsedPages') ?? Infinity),
        characterLimit: Math.min(MAX_FULL_TEXT_CHARACTERS, budget?.remaining('parsedCharacters') ?? Infinity),
      },
      resourceLimits: { maxOldGenerationSizeMb: 256 },
    });
    const finish = (error?: unknown, pages?: string[]) => {
      signal.removeEventListener('abort', abort);
      void worker.terminate().catch(() => undefined);
      if (pages) resolve(pages);
      else reject(error);
    };
    const abort = () => finish(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    worker.on('message', message => {
      try {
        if ('parsedCharacters' in message) {
          budget?.charge('parsedPages');
          budget?.charge('parsedCharacters', message.parsedCharacters);
        } else if (message.pages) finish(undefined, message.pages);
        else finish(new Error('PDF is unreadable or exceeds parsing limits'));
      } catch (error) {
        finish(error);
      }
    });
    worker.once('error', () => finish(new Error('PDF worker failed')));
    worker.once('exit', () => finish(new Error('PDF worker exited before returning text')));
    if (signal.aborted) abort();
  });
  signal.throwIfAborted();
  const pageTexts = rawPages.map(canonicalizeFullText);
  const pageCount = pageTexts.length;

  const pages: FullTextPage[] = [];
  let text = '';
  for (let index = 0; index < pageTexts.length; index += 1) {
    if (text && pageTexts[index]) text += '\n\n';
    const start = text.length;
    text += pageTexts[index];
    pages.push({
      pageNumber: index + 1,
      start,
      end: text.length,
      textSha256: createHash('sha256').update(pageTexts[index]).digest('hex'),
    });
  }
  if (text.length < 200) {
    throw new Error(`${input.name} did not contain extractable PDF text; OCR is required`);
  }
  if (text.length > MAX_FULL_TEXT_CHARACTERS) {
    throw new Error(`${input.name} exceeds the ${MAX_FULL_TEXT_CHARACTERS}-character full-text limit`);
  }
  const parsedPageCount = pageTexts.filter(page => page.length >= 20).length;
  return {
    schema: 'dgr.full-text-document.v1',
    origin: input.origin ?? 'pdf',
    name: input.name,
    mediaType: input.mediaType ?? 'application/pdf',
    documentSha256: input.documentSha256 ?? createHash('sha256').update(input.bytes).digest('hex'),
    text,
    textSha256: createHash('sha256').update(text).digest('hex'),
    textLength: text.length,
    canonicalization: FULL_TEXT_CANONICALIZATION,
    offsetEncoding: FULL_TEXT_OFFSET_ENCODING,
    pageCount,
    parsedPageCount,
    parseCoverage: pageCount > 0 ? parsedPageCount / pageCount : 0,
    pages,
    identifiers: input.identifiers ?? extractPdfIdentifiers(text.slice(0, 30_000)),
    ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
    retrievedAt: input.retrievedAt ?? new Date().toISOString(),
    parser: 'pdfjs-dist',
  };
}

function extractPdfIdentifiers(text: string): { pmid?: string; doi?: string } {
  const pmid = text.match(/\bPMID\s*[: ]\s*(\d{5,10})\b/i)?.[1];
  const doi = text.match(/\b(10\.\d{4,9}\/[\-._;()/:A-Z0-9]+)\b/i)?.[1]?.replace(/[),.;\]]+$/, '');
  return { pmid, doi };
}
