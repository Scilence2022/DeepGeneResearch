import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { verifySignature } from "@/utils/signature";

const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "";
const ALLOW_UNAUTHENTICATED_DEV = process.env.DGR_ALLOW_UNAUTHENTICATED_DEV === "true";

export interface ResearchPrincipal {
  workspaceId?: string;
}

function configuredWorkspaceTokens(): Map<string, string> | null {
  try {
    const value: unknown = JSON.parse(process.env.DGR_WORKSPACE_TOKENS || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const entries = Object.entries(value);
    if (entries.length > 100 || entries.some(([id, token]) =>
      !/^[a-z0-9][a-z0-9-]{0,62}$/.test(id) || typeof token !== 'string'
      || !/^[!-~]{32,256}$/.test(token) || token === ACCESS_PASSWORD
    )) return null;
    if (new Set(entries.map(([, token]) => token)).size !== entries.length) return null;
    return new Map(entries);
  } catch {
    return null;
  }
}

const workspaceTokens = configuredWorkspaceTokens();

function getBearerToken(request: NextRequest): string {
  const authorization = request.headers.get("authorization") || "";
  return /^Bearer\s+([^\s]+)$/i.exec(authorization)?.[1] || "";
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

function isAllowedOrigin(origin: string): boolean {
  const configured = [process.env.MCP_SERVER_BASE_URL, ...(process.env.DGR_ALLOWED_ORIGINS || '').split(',')];
  return configured.some(value => {
    try {
      return Boolean(value) && new URL(value!.trim()).origin === origin;
    } catch {
      return false;
    }
  });
}

export function authenticateResearch(request: NextRequest): NextResponse | ResearchPrincipal {
  const origin = request.headers.get('origin');
  if (origin !== null && !isAllowedOrigin(origin)) {
    return NextResponse.json({ error: 403, error_description: 'Origin is not allowed' }, { status: 403 });
  }
  if (!workspaceTokens) {
    return NextResponse.json({ error: 503, error_description: 'Invalid workspace authentication configuration' }, { status: 503 });
  }
  if (!workspaceTokens.size || ACCESS_PASSWORD) {
    const configurationError = authConfigurationError();
    if (configurationError) return configurationError;
  }

  const token = getBearerToken(request);
  if (ACCESS_PASSWORD && secretsEqual(token, ACCESS_PASSWORD)) return {};
  let workspaceId: string | undefined;
  for (const [id, secret] of workspaceTokens) {
    if (secretsEqual(token, secret)) workspaceId = id;
  }
  if (workspaceId) return { workspaceId };
  if (!workspaceTokens.size && !ACCESS_PASSWORD) return {};

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

export function requireMcpAuth(request: NextRequest): NextResponse | null {
  const principal = authenticateResearch(request);
  return principal instanceof NextResponse ? principal : null;
}

/** Browser crawler requests use the app's short-lived signed bearer token. */
export async function requireCrawlerAuth(request: NextRequest): Promise<NextResponse | null> {
  const configurationError = authConfigurationError();
  if (configurationError) return configurationError;
  if (!ACCESS_PASSWORD) return null;

  const token = getBearerToken(request);
  if (secretsEqual(token, ACCESS_PASSWORD) || await verifySignature(token, ACCESS_PASSWORD, Date.now())) {
    return null;
  }
  return NextResponse.json(
    { error: 401, error_description: "No permissions" },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="deep-research-crawler"' } }
  );
}
