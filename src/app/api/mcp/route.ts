import { admitResearchRequest } from '@/app/api/mcp/admission';
import { NextResponse, type NextRequest } from "next/server";
import { StreamableHTTPServerTransport } from "@/libs/mcp-server/streamableHttp";
import { initMcpServer } from "./server";
import { authenticateResearch } from "./auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 分钟超时

export async function POST(req: NextRequest) {
  const principal = authenticateResearch(req);
  if (principal instanceof NextResponse) return principal;
  const limited = admitResearchRequest(principal.workspaceId);
  if (limited) return limited;

  const server = initMcpServer(principal.workspaceId);
  try {
    const transport: StreamableHTTPServerTransport =
      new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true, // Return JSON instead of SSE for simple clients
      });

    server.server.onerror = (err) => console.error("[MCP]", err);

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
    return NextResponse.json(
      { code: 500, message: "Unknown MCP server error" },
      { status: 500 }
    );
  } finally {
    await server.close().catch((closeError) => {
      console.error("[MCP] Failed to close stateless transport:", closeError);
    });
  }
}
