import { admitResearchRequest } from '@/app/api/mcp/admission';
import { NextRequest, NextResponse } from "next/server";
import { SSEServerTransport } from "@/libs/mcp-server/sse";
import { initMcpServer } from "../server";
import { authenticateResearch } from "../auth";

export const dynamic = "force-dynamic";

// In-memory storage for active transport sessions.
// In a production app, consider a more robust distributed cache or state store.
const activeTransports = new Map<string, { transport: SSEServerTransport; workspaceId?: string }>();

// The API route path clients will POST messages to
const POST_ENDPOINT_PATH = "/api/mcp/sse/messages"; // This must match your POST API route path

export async function GET(req: NextRequest): Promise<NextResponse> {
  const principal = authenticateResearch(req);
  if (principal instanceof NextResponse) return principal;

  if (activeTransports.size >= 40 || [...activeTransports.values()].filter(
    session => session.workspaceId === principal.workspaceId,
  ).length >= 8) {
    return NextResponse.json({ error: 'MCP SSE session capacity reached' }, { status: 429 });
  }

  // Create an MCP server
  const server = initMcpServer(principal.workspaceId);

  // Create a new transport instance for this session
  const transport = new SSEServerTransport({
    endpoint: POST_ENDPOINT_PATH,
  });
  const sessionId = transport.sessionId;

  // Store the transport instance keyed by session ID
  activeTransports.set(sessionId, { transport, workspaceId: principal.workspaceId });

  const close = () => { void server.close(); };
  const timeout = setTimeout(close, 300_000);
  const cleanup = () => {
    clearTimeout(timeout);
    req.signal.removeEventListener('abort', close);
    activeTransports.delete(sessionId);
  };

  server.server.onerror = (error) => {
    console.error("[MCP SSE]", error);
  };
  server.server.onclose = cleanup;

  try {
    await server.connect(transport);
    const response = await transport.handleGetRequest();
    req.signal.addEventListener('abort', close, { once: true });
    if (req.signal.aborted) close();
    return new NextResponse(response.body, response);
  } catch {
    cleanup();
    close();
    return NextResponse.json({ error: 'Unable to open MCP SSE session' }, { status: 503 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const principal = authenticateResearch(req);
  if (principal instanceof NextResponse) return principal;
  const limited = admitResearchRequest(principal.workspaceId);
  if (limited) return limited;

  // Extract the session ID from the query parameter sent by the client
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return new NextResponse(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Missing sessionId query parameter" },
        id: null,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Find the corresponding transport instance
  const session = activeTransports.get(sessionId);

  if (!session || session.workspaceId !== principal.workspaceId) {
    // Session not found or already closed
    return new NextResponse(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found" },
        id: null,
      }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Delegate the POST message handling to the specific transport instance
  const response = await session.transport.handlePostMessage(req);
  return new NextResponse(response.body, response);
}
