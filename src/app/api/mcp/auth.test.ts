import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { generateSignature } from '@/utils/signature';

const originalPassword = process.env.ACCESS_PASSWORD;
const originalUnauthenticatedDev = process.env.DGR_ALLOW_UNAUTHENTICATED_DEV;

describe.sequential('MCP and crawler authentication', () => {
  beforeEach(() => {
    delete process.env.ACCESS_PASSWORD;
    delete process.env.DGR_ALLOW_UNAUTHENTICATED_DEV;
    vi.resetModules();
  });

  afterEach(() => {
    if (originalPassword === undefined) delete process.env.ACCESS_PASSWORD;
    else process.env.ACCESS_PASSWORD = originalPassword;
    if (originalUnauthenticatedDev === undefined) delete process.env.DGR_ALLOW_UNAUTHENTICATED_DEV;
    else process.env.DGR_ALLOW_UNAUTHENTICATED_DEV = originalUnauthenticatedDev;
  });

  function request(token?: string) {
    return new NextRequest('http://localhost/api/mcp', {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
  }

  it('fails configuration closed when the shared secret is trivially short', async () => {
    process.env.ACCESS_PASSWORD = 'short-secret';
    vi.resetModules();
    const { requireMcpAuth } = await import('./auth');

    const response = requireMcpAuth(request('short-secret'));
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toMatchObject({
      error_description: expect.stringContaining('at least 16 characters'),
    });
  });

  it('accepts the long shared bearer secret for MCP but not a query-string token', async () => {
    const password = 'a-long-random-secret-value';
    process.env.ACCESS_PASSWORD = password;
    vi.resetModules();
    const { requireMcpAuth } = await import('./auth');

    expect(requireMcpAuth(request(password))).toBeNull();
    const queryRequest = new NextRequest(`http://localhost/api/mcp?access_token=${password}`);
    expect(requireMcpAuth(queryRequest)?.status).toBe(401);
  });

  it('accepts the browser crawler short-lived signature derived from the same secret', async () => {
    const password = 'another-long-random-secret';
    process.env.ACCESS_PASSWORD = password;
    vi.resetModules();
    const { requireCrawlerAuth } = await import('./auth');

    expect(requireCrawlerAuth(request(generateSignature(password, Date.now())))).toBeNull();
  });
});
