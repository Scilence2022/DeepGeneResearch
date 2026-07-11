import { NextResponse, type NextRequest } from "next/server";

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";
const ALLOW_INSECURE_LOCAL = process.env.DGR_ALLOW_INSECURE_LOCAL === "true";

function getBearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" ? token || "" : "";
}

export function getMcpBaseUrl(request?: NextRequest): string {
  const configuredBaseUrl = (process.env.MCP_SERVER_BASE_URL || "").trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  if (!request) {
    return "";
  }

  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  return host ? `${proto}://${host}` : "";
}

export function requireMcpAuth(request: NextRequest): NextResponse | null {
  if (!ACCESS_PASSWORD) {
    if (ALLOW_INSECURE_LOCAL && process.env.NODE_ENV !== "production") {
      return null;
    }
    return NextResponse.json(
      {
        error: 503,
        error_description: "MCP authentication is not configured. Set ACCESS_PASSWORD or use DGR_ALLOW_INSECURE_LOCAL only for local development.",
      },
      { status: 503 }
    );
  }

  // Secrets in query strings leak through browser history, proxy logs, and
  // report URLs. Streamable MCP clients must use Authorization: Bearer.
  const token = getBearerToken(request);

  if (token === ACCESS_PASSWORD) {
    return null;
  }

  return NextResponse.json(
    {
      error: 401,
      error_description: "No permissions",
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Bearer realm="deep-research-mcp"',
      },
    }
  );
}
