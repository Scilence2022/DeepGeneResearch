import { NextResponse, type NextRequest } from "next/server";
import { StreamableHTTPServerTransport } from "@/libs/mcp-server/streamableHttp";
import { initMcpServer } from "./server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 分钟超时
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
    const server = initMcpServer();
    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true, // Return JSON instead of SSE for simple clients
      });

    transport.onclose = () => {
      transport.close();
      server.close();
    };

    transport.onerror = (err) => {
      return NextResponse.json(
        { code: 500, message: err.message },
        { status: 500 }
      );
    };

    await server.connect(transport);
    const response = await transport.handleRequest(req);
    return new NextResponse(response.body, response);
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
