import { marked } from "marked";
import DOMPurify from "dompurify";

export function markdownToDoc(markdown: string): string {
  const html = DOMPurify.sanitize(marked.parse(markdown, { async: false }), { USE_PROFILES: { html: true } });
  // Word can open an HTML document saved with a ".doc" extension.
  // This function returns that minimal HTML wrapper.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${html}</body></html>`;
}
