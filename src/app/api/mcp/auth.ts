import { NextResponse, type NextRequest } from "next/server";

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";

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
    return null;
  }

  const token =
    getBearerToken(request) ||
    request.nextUrl.searchParams.get("access_token") ||
    request.nextUrl.searchParams.get("password") ||
    "";

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
