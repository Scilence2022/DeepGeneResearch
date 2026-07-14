import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { verifySignature } from "@/utils/signature";

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";
const ALLOW_UNAUTHENTICATED_DEV = process.env.DGR_ALLOW_UNAUTHENTICATED_DEV === "true";

function getBearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" ? token || "" : "";
}

function secretsEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function authConfigurationError(): NextResponse | null {
  if (!ACCESS_PASSWORD) {
    if (ALLOW_UNAUTHENTICATED_DEV && process.env.NODE_ENV !== "production") {
      return null;
    }
    return NextResponse.json(
      {
        error: 503,
        error_description: "MCP authentication is not configured. Set ACCESS_PASSWORD or use DGR_ALLOW_UNAUTHENTICATED_DEV only in an isolated development environment.",
      },
      { status: 503 }
    );
  }
  if (ACCESS_PASSWORD.length < 16) {
    return NextResponse.json(
      {
        error: 503,
        error_description: "ACCESS_PASSWORD must contain at least 16 characters.",
      },
      { status: 503 }
    );
  }
  return null;
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
  const configurationError = authConfigurationError();
  if (configurationError) return configurationError;
  if (!ACCESS_PASSWORD) return null;

  // Secrets in query strings leak through browser history, proxy logs, and
  // report URLs. Streamable MCP clients must use Authorization: Bearer.
  const token = getBearerToken(request);

  if (secretsEqual(token, ACCESS_PASSWORD)) {
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

/** Browser crawler requests use the app's short-lived signed bearer token. */
export function requireCrawlerAuth(request: NextRequest): NextResponse | null {
  const configurationError = authConfigurationError();
  if (configurationError) return configurationError;
  if (!ACCESS_PASSWORD) return null;

  const token = getBearerToken(request);
  if (secretsEqual(token, ACCESS_PASSWORD) || verifySignature(token, ACCESS_PASSWORD, Date.now())) {
    return null;
  }
  return NextResponse.json(
    { error: 401, error_description: "No permissions" },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="deep-research-crawler"' } }
  );
}
