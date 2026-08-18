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
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes),
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const pageCount = document.numPages;
  const pageTexts: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = canonicalizeFullText(
        textContent.items
          .filter((item: any) => typeof item?.str === 'string')
          .map((item: any) => item.str)
          .join(' '),
      );
      pageTexts.push(text);
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

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
