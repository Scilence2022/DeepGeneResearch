import { NextResponse, type NextRequest } from "next/server";
import { requireMcpAuth } from "../mcp/auth";

export const runtime = "edge";
export const preferredRegion = [
  "cle1",
  "iad1",
  "pdx1",
  "sfo1",
  "sin1",
  "syd1",
  "hnd1",
  "kix1",
];

export async function POST(req: NextRequest) {
  try {
    const unauthorized = requireMcpAuth(req);
    if (unauthorized) return unauthorized;
    const { url } = await req.json();
    if (!url) throw new Error("Missing parameters!");
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) URLs are allowed');
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '::1' ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    ) {
      throw new Error('Private-network URLs are not allowed');
    }
    const response = await fetch(parsed, { next: { revalidate: 60 }, redirect: 'error' });
    if (!response.ok) throw new Error(`Crawler upstream returned ${response.status}`);
    const result = await response.text();

    const titleRegex = /<title>(.*?)<\/title>/i;
    const titleMatch = result.match(titleRegex);
    const title = titleMatch ? titleMatch[1].trim() : "";

    return NextResponse.json({ url, title, content: result });
  } catch (error) {
    if (error instanceof Error) {
      console.error(error);
      return NextResponse.json(
        { code: 500, message: error.message },
        { status: 500 }
      );
    }
  }
}
