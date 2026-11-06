import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getCustomModelList, multiApiKeyPolling } from "@/utils/model";
import { verifySignature } from "@/utils/signature";
import { readBoundedJson } from "@/utils/request-json";
import { generateAuthToken } from "@/utils/vertexAuth";

const accessPassword = process.env.ACCESS_PASSWORD || "";
// AI provider API key
const GOOGLE_GENERATIVE_AI_API_KEY =
  process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const XAI_API_KEY = process.env.XAI_API_KEY || "";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const AZURE_API_KEY = process.env.AZURE_API_KEY || "";
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL || "";
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY || "";
const GOOGLE_PRIVATE_KEY_ID = process.env.GOOGLE_PRIVATE_KEY_ID || "";
const OPENAI_COMPATIBLE_API_KEY = process.env.OPENAI_COMPATIBLE_API_KEY || "";
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY || "";
// Search provider API key
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY || "";
const EXA_API_KEY = process.env.EXA_API_KEY || "";
const BOCHA_API_KEY = process.env.BOCHA_API_KEY || "";
// Disabled Provider
const DISABLED_AI_PROVIDER = process.env.NEXT_PUBLIC_DISABLED_AI_PROVIDER || "";
const DISABLED_SEARCH_PROVIDER =
  process.env.NEXT_PUBLIC_DISABLED_SEARCH_PROVIDER || "";
const MODEL_LIST = process.env.NEXT_PUBLIC_MODEL_LIST || "";

// Limit the middleware to paths starting with `/api/`
export const config = {
  // Skip /api/mcp routes: MCP route handlers perform Node-runtime auth locally.
  // This avoids Edge Runtime eval() issue with certain API routes
  matcher: ["/api/ai/:path*", "/api/search/:path*"],
};

let proxyWindowEnds = 0;
let proxyRequests = 0;

const ERRORS = {
  NO_PERMISSIONS: {
    code: 403,
    message: "No permissions",
    status: "FORBIDDEN",
  },
  NO_API_KEY: {
    code: 500,
    message: "The server does not have an API key.",
    status: "Internal Server Error",
  },
};

export async function middleware(request: NextRequest) {
  const devBypass = !accessPassword && process.env.NODE_ENV !== "production"
    && process.env.DGR_ALLOW_UNAUTHENTICATED_DEV === "true";
  if (!devBypass && accessPassword.length < 16) {
    return NextResponse.json({ error: "Provider proxy authentication is not configured" }, { status: 503 });
  }
  const provider = request.nextUrl.pathname.split("/")[3];
  const isAI = request.nextUrl.pathname.startsWith("/api/ai/");
  const isSearch = request.nextUrl.pathname.startsWith("/api/search/");
  const providerHeaders: Record<string, string> = { google: "x-goog-api-key", anthropic: "x-api-key", azure: "api-key" };
  const providerHeader = isAI ? providerHeaders[provider] : undefined;
  const token = providerHeader
    ? request.headers.get(providerHeader) || ""
    : /^Bearer\s+([^\s]+)$/i.exec(request.headers.get("authorization") || "")?.[1] || "";
  if (!devBypass && !(await verifySignature(token, accessPassword, Date.now()))) {
    return NextResponse.json({ error: ERRORS.NO_PERMISSIONS }, { status: 403 });
  }
  if (Number(request.headers.get("content-length")) > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }

  const now = Date.now();
  if (now >= proxyWindowEnds) {
    proxyWindowEnds = now + 60_000;
    proxyRequests = 0;
  }
  if (++proxyRequests > 120) {
    return NextResponse.json({ error: "Provider proxy rate limit reached" }, {
      status: 429, headers: { "Retry-After": String(Math.ceil((proxyWindowEnds - now) / 1000)) },
    });
  }

  let requestModel = "";
  if (request.body) {
    try {
      const body = await readBoundedJson(request.clone(), 2 * 1024 * 1024) as { model?: unknown } | null;
      if (typeof body?.model === "string") requestModel = body.model;
    } catch (error) {
      const status = error && typeof error === "object" && "status" in error && error.status === 413 ? 413 : 400;
      return NextResponse.json({ error: "Invalid or oversized provider request body" }, { status });
    }
  }

  const disabledAIProviders =
    DISABLED_AI_PROVIDER.length > 0 ? DISABLED_AI_PROVIDER.split(",") : [];
  const disabledSearchProviders =
    DISABLED_SEARCH_PROVIDER.length > 0
      ? DISABLED_SEARCH_PROVIDER.split(",")
      : [];

  const hasDisabledGeminiModel = () => {
    if (request.method.toUpperCase() === "GET") return false;
    const { availableModelList, disabledModelList } = getCustomModelList(
      MODEL_LIST.length > 0 ? MODEL_LIST.split(",") : []
    );
    const isAvailableModel = availableModelList.some((availableModel) =>
      request.nextUrl.pathname.includes(`models/${availableModel}:`)
    );
    if (isAvailableModel) return false;
    if (disabledModelList.includes("all")) return true;
    return disabledModelList.some((disabledModel) =>
      request.nextUrl.pathname.includes(`models/${disabledModel}:`)
    );
  };
  const hasDisabledAIModel = () => {
    if (request.method.toUpperCase() === "GET") return false;
    const { availableModelList, disabledModelList } = getCustomModelList(
      MODEL_LIST.length > 0 ? MODEL_LIST.split(",") : []
    );
    const isAvailableModel = availableModelList.some(
      (availableModel) => availableModel === requestModel
    );
    if (isAvailableModel) return false;
    if (disabledModelList.includes("all")) return true;
    return disabledModelList.some((disabledModel) => disabledModel === requestModel);
  };

  if (isAI && provider === "siliconflow") {
    if (disabledAIProviders.includes(provider) || hasDisabledAIModel()) {
      return NextResponse.json({ error: ERRORS.NO_PERMISSIONS }, { status: 403 });
    }
    const apiKey = multiApiKeyPolling(SILICONFLOW_API_KEY);
    if (!apiKey) return NextResponse.json({ error: ERRORS.NO_API_KEY }, { status: 500 });
    return NextResponse.next({ request: { headers: new Headers({
      "Content-Type": request.headers.get("Content-Type") || "application/json",
      Authorization: `Bearer ${apiKey}`,
    }) } });
  }

  if (isAI && provider === "google") {
    const isDisabledGeminiModel = hasDisabledGeminiModel();
    if (
      disabledAIProviders.includes("google") ||
      isDisabledGeminiModel
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(GOOGLE_GENERATIVE_AI_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set(
          "x-goog-api-client",
          request.headers.get("x-goog-api-client") || "genai-js/0.24.0"
        );
        requestHeaders.set("x-goog-api-key", apiKey);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isAI && provider === "openrouter") {
    const isDisabledModel = hasDisabledAIModel();
    if (
      disabledAIProviders.includes("openrouter") ||
      isDisabledModel
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(OPENROUTER_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("Authorization", `Bearer ${apiKey}`);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isAI && provider === "openaicompatible") {
    const isDisabledModel = hasDisabledAIModel();
    if (
      disabledAIProviders.includes("openaicompatible") ||
      isDisabledModel
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(OPENAI_COMPATIBLE_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("Authorization", `Bearer ${apiKey}`);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isAI && provider === "openai") {
    const isDisabledModel = hasDisabledAIModel();
    if (
      disabledAIProviders.includes("openai") ||
      isDisabledModel
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(OPENAI_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("Authorization", `Bearer ${apiKey}`);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isAI && provider === "anthropic") {
    const isDisabledModel = hasDisabledAIModel();
    if (
      disabledAIProviders.includes("anthropic") ||
      isDisabledModel
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(ANTHROPIC_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("x-api-key", apiKey);
        requestHeaders.set(
          "anthropic-version",
          request.headers.get("anthropic-version") || "2023-06-01"
        );
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isAI && provider === "deepseek") {
    const isDisabledModel = hasDisabledAIModel();
    if (
      disabledAIProviders.includes("deepseek") ||
      isDisabledModel
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(DEEPSEEK_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("Authorization", `Bearer ${apiKey}`);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isAI && provider === "xai") {
    const isDisabledModel = hasDisabledAIModel();
    if (
      disabledAIProviders.includes("xai") ||
      isDisabledModel
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(XAI_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("Authorization", `Bearer ${apiKey}`);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isAI && provider === "mistral") {
    const isDisabledModel = hasDisabledAIModel();
    if (
      disabledAIProviders.includes("mistral") ||
      isDisabledModel
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(MISTRAL_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("Authorization", `Bearer ${apiKey}`);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isAI && provider === "azure") {
    const isDisabledModel = hasDisabledAIModel();
    if (
      disabledAIProviders.includes("azure") ||
      isDisabledModel
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(AZURE_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("api-key", apiKey);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isAI && provider === "google-vertex") {
    const isDisabledModel = hasDisabledAIModel();
    if (
      disabledAIProviders.includes("google-vertex") ||
      isDisabledModel
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = await generateAuthToken({
        clientEmail: GOOGLE_CLIENT_EMAIL,
        privateKey: GOOGLE_PRIVATE_KEY,
        privateKeyId: GOOGLE_PRIVATE_KEY_ID,
      });

      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("Authorization", `Bearer ${apiKey}`);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  // The pollinations model only verifies access to the backend API
  if (isAI && provider === "pollinations") {
    const isDisabledModel = hasDisabledAIModel();
    if (
      disabledAIProviders.includes("pollinations") ||
      isDisabledModel
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const requestHeaders = new Headers();
      requestHeaders.set(
        "Content-Type",
        request.headers.get("Content-Type") || "application/json"
      );
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }
  }
  // The ollama model only verifies access to the backend API
  if (isAI && provider === "ollama") {
    const isDisabledModel = hasDisabledAIModel();
    if (
      disabledAIProviders.includes("ollama") ||
      isDisabledModel
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const requestHeaders = new Headers();
      requestHeaders.set(
        "Content-Type",
        request.headers.get("Content-Type") || "application/json"
      );
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }
  }
  if (isSearch && provider === "tavily") {
    if (
      request.method.toUpperCase() !== "POST" ||
      disabledSearchProviders.includes("tavily")
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(TAVILY_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("Authorization", `Bearer ${apiKey}`);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isSearch && provider === "firecrawl") {
    if (
      request.method.toUpperCase() !== "POST" ||
      disabledSearchProviders.includes("firecrawl")
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(FIRECRAWL_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("Authorization", `Bearer ${apiKey}`);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isSearch && provider === "exa") {
    if (
      request.method.toUpperCase() !== "POST" ||
      disabledSearchProviders.includes("exa")
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(EXA_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("Authorization", `Bearer ${apiKey}`);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isSearch && provider === "bocha") {
    if (
      request.method.toUpperCase() !== "POST" ||
      disabledSearchProviders.includes("bocha")
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const apiKey = multiApiKeyPolling(BOCHA_API_KEY);
      if (apiKey) {
        const requestHeaders = new Headers();
        requestHeaders.set(
          "Content-Type",
          request.headers.get("Content-Type") || "application/json"
        );
        requestHeaders.set("Authorization", `Bearer ${apiKey}`);
        return NextResponse.next({
          request: {
            headers: requestHeaders,
          },
        });
      } else {
        return NextResponse.json(
          {
            error: ERRORS.NO_API_KEY,
          },
          { status: 500 }
        );
      }
    }
  }
  if (isSearch && provider === "searxng") {
    if (
      request.method.toUpperCase() !== "POST" ||
      disabledSearchProviders.includes("searxng")
    ) {
      return NextResponse.json(
        { error: ERRORS.NO_PERMISSIONS },
        { status: 403 }
      );
    } else {
      const requestHeaders = new Headers();
      requestHeaders.set(
        "Content-Type",
        request.headers.get("Content-Type") || "application/json"
      );
      requestHeaders.delete("Authorization");
      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    }
  }
  return NextResponse.json({ error: ERRORS.NO_PERMISSIONS }, { status: 403 });
}
