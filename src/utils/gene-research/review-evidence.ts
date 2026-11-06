import { createHash } from 'node:crypto';
import { compareSourceWorkIdentity, workIdentifiers } from '@/utils/full-text/work-identity';
import type { FullTextDocument, FullTextEvidenceSpan } from './full-text';

type ReviewSource = Parameters<typeof workIdentifiers>[0] & {
  targetMatch?: boolean;
  structuredData?: NonNullable<Parameters<typeof workIdentifiers>[0]['structuredData']> & { retracted?: boolean };
  fullText?: FullTextDocument;
  fullTextEvidence?: FullTextEvidenceSpan[];
};

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

/** Review excerpts carry their own locator and never qualify a ChangeSet operation. */
export function buildReviewEvidence(sources: readonly unknown[]) {
  const excerpts = [];
  for (const candidate of sources) {
    const source = candidate as ReviewSource | null;
    const document = source?.fullText;
    if (source?.targetMatch !== true || source.structuredData?.retracted === true || document?.schema !== 'dgr.full-text-document.v1'
      || document.origin === 'snippet' || !/^[a-f0-9]{64}$/.test(document.documentSha256)
      || typeof document.text !== 'string' || hash(document.text) !== document.textSha256
      || document.text.length !== document.textLength) continue;
    const privateUpload = document.origin === 'user_upload';
    const work = workIdentifiers(source);
    const doi = String(work.doi || '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').toLowerCase();
    if (!privateUpload && (work.pmid || document.identifiers.pmid || !/^10\.\d{4,9}\/[^\s]+$/.test(doi)
      || compareSourceWorkIdentity(source, document.identifiers) !== 'match')) continue;

    for (const span of source.fullTextEvidence ?? []) {
      if (span.kind !== 'full_text_span' || span.textSha256 !== document.textSha256
        || span.textLength !== document.textLength || span.canonicalization !== document.canonicalization
        || span.offsetEncoding !== document.offsetEncoding || !Number.isSafeInteger(span.excerptStart)
        || !Number.isSafeInteger(span.excerptEnd) || span.excerptStart < 0
        || span.excerptEnd <= span.excerptStart || span.excerptEnd > document.textLength
        || document.text.slice(span.excerptStart, span.excerptEnd) !== span.excerpt
        || hash(span.excerpt) !== span.excerptSha256) continue;
      if (privateUpload && !document.pages.some(page => page.pageNumber === span.pageNumber
        && span.excerptStart >= page.start && span.excerptEnd <= page.end
        && hash(document.text.slice(page.start, page.end)) === page.textSha256)) continue;
      excerpts.push({
        origin: document.origin,
        locator: privateUpload
          ? { scheme: 'sha256' as const, value: document.documentSha256 }
          : { scheme: 'doi' as const, value: doi },
        documentSha256: document.documentSha256,
        ...span,
      });
      if (excerpts.length === 18) break;
    }
    if (excerpts.length === 18) break;
  }
  return { schema: 'dgr.review-evidence.v1' as const, eligibility: 'review_only' as const, excerpts };
}
