import { describe, expect, it } from 'vitest';
import { researchBudget, runWithResearchBudget } from '@/services/research-run-budget';
import { segmentPdfDocument } from './pdf';

function fixturePdf() {
  const pageText = 'The synthetic PDF contains extractable text and cites PMID: 20000002.';
  const lines = Array.from({ length: 5 }, () => `(${pageText}) Tj T*`).join(' ');
  const stream = `BT /F1 10 Tf 14 TL 30 500 Td ${lines} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 600] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let text = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = text.length;
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = text.length;
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) text += `${String(offset).padStart(10, '0')} 00000 n \n`;
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(text));
}

describe('PDF worker', () => {
  it('extracts text in a worker and charges the run budget', async () => {
    await runWithResearchBudget(async () => {
      const result = await segmentPdfDocument({ bytes: fixturePdf(), name: 'synthetic.pdf', origin: 'user_upload' });
      expect(result.text).toContain('The synthetic PDF contains');
      expect(result.pages).toHaveLength(1);
      expect(result.identifiers).toEqual({});
      expect(researchBudget()?.snapshot().used.parsedPages).toBe(1);
    });
  });

  it('terminates in-flight parsing on cancellation', async () => {
    const controller = new AbortController();
    const parsed = segmentPdfDocument({ bytes: fixturePdf(), name: 'synthetic.pdf', signal: controller.signal });
    controller.abort();
    await expect(parsed).rejects.toMatchObject({ name: 'AbortError' });
  });
});
