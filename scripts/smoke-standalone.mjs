import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const host = '127.0.0.1';
const password = 'local-standalone-smoke-only';
const model = 'audit-local';
const report = '# Offline report\n\nSynthetic smoke-test content.';
const directory = await mkdtemp(path.join(os.tmpdir(), 'dgr-standalone-smoke-'));
const ledger = path.join(directory, 'tasks.json');
const previousRun = randomUUID();
let upstreamCalls = 0;
let rejectUpstream = false;
let app;
let output = '';
let base;

const upstream = http.createServer(async (request, response) => {
  upstreamCalls++;
  let body = '';
  for await (const chunk of request) body += chunk;
  if (rejectUpstream) {
    response.writeHead(400, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: 'Intentional smoke-test failure' } }));
    return;
  }

  if (request.method === 'GET') {
    assert.equal(request.headers.authorization, 'Bearer offline');
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ data: [] }));
    return;
  }
  const input = JSON.parse(body);
  const fields = { id: 'offline', created: 0, model };
  const usage = { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 };
  if (input.stream) {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(`data: ${JSON.stringify({ ...fields, choices: [{ index: 0, delta: { role: 'assistant', content: report }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ ...fields, usage, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    response.end('data: [DONE]\n\n');
  } else {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      ...fields,
      usage,
      choices: [{ index: 0, message: { role: 'assistant', content: '[]' }, finish_reason: 'stop' }],
    }));
  }
});

async function waitFor(check, description) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function call(route, { method = 'GET', authenticated = true, body, headers = {} } = {}) {
  return fetch(base + route, {
    method,
    headers: {
      ...(authenticated ? { Authorization: `Bearer ${password}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
}

async function startApp() {
  const listener = net.createServer();
  listener.listen(0, host);
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  base = `http://${host}:${port}`;
  app = spawn(process.execPath, ['.next/standalone/server.js'], {
    env: {
      ...process.env,
      HOSTNAME: host,
      PORT: String(port),
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      MCP_AI_PROVIDER: 'openai',
      MCP_SEARCH_PROVIDER: 'model',
      MCP_THINKING_MODEL: model,
      MCP_TASK_MODEL: model,
      MCP_TASK_STORAGE_FILE: ledger,
      OPENAI_API_BASE_URL: `http://${host}:${upstream.address().port}`,
      OPENAI_API_KEY: 'offline',
      ACCESS_PASSWORD: password,
      DGR_ALLOWED_ORIGINS: base,
      DGR_WORKER_COUNT: '1',
    },
  });
  app.stdout.on('data', chunk => { output += chunk; });
  app.stderr.on('data', chunk => { output += chunk; });
  await waitFor(async () => {
    if (app.exitCode !== null) throw new Error(`Standalone server exited with status ${app.exitCode}`);
    try {
      return (await call('/api/mcp/tasks', { authenticated: false })).status === 401;
    } catch {
      return false;
    }
  }, 'standalone startup');
}

async function stopApp() {
  if (!app || app.exitCode !== null || app.signalCode !== null) return;
  const exit = once(app, 'exit');
  app.kill();
  await exit;
}

try {
  const now = new Date().toISOString();
  await writeFile(ledger, JSON.stringify([{
    id: previousRun,
    status: 'completed',
    progress: 100,
    parameters: { geneSymbol: 'mock', organism: 'mock' },
    createdAt: now,
    updatedAt: now,
    eventSeq: 1,
    result: { finalReport: report, download: { researchId: 'legacy-offline-id' } },
  }]));
  upstream.listen(0, host);
  await once(upstream, 'listening');
  await startApp();

  const query = { query: 'Explain queue fairness in an offline system.' };
  const anonymous = await call('/api/research/start', { method: 'POST', authenticated: false, body: query });
  assert.equal(anonymous.status, 401);
  assert.equal(upstreamCalls, 0);

  const invalid = await call('/api/research/start', { method: 'POST', body: { query: 42 } });
  assert.equal(invalid.status, 400);

  const tooComplex = await call('/api/research/start', { method: 'POST', body: { ...query, extra: Array(2_049).fill(null) } });
  assert.equal(tooComplex.status, 413);
  const proxy = '/api/ai/openai/v1/models?slug=v1&slug=models';
  assert.equal((await call(proxy, { authenticated: false })).status, 403);
  const timestamp = Date.now();
  const digest = createHmac('sha256', password).update(`dgr-browser-proxy-v1:${timestamp}`).digest('hex');
  const models = await call(proxy, { headers: { Authorization: `Bearer ${timestamp}.${digest}` } });
  assert.equal(models.status, 200);
  assert.deepEqual(await models.json(), { data: [] });

  const rpc = { jsonrpc: '2.0', id: 1, method: 'initialize', params: {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'smoke', version: '1' },
  } };
  const accept = 'application/json, text/event-stream';
  const foreign = await call('/api/mcp', { method: 'POST', body: rpc, headers: { Accept: accept, Origin: 'https://foreign.invalid' } });
  assert.equal(foreign.status, 403);
  const mcp = await call('/api/mcp', { method: 'POST', body: rpc, headers: { Accept: accept, Origin: base } });
  assert.equal(mcp.status, 200);
  assert.equal((await mcp.json()).result.protocolVersion, '2025-03-26');

  const submitted = await call('/api/research/start', { method: 'POST', body: query });
  assert.equal(submitted.status, 200);
  const { taskId } = await submitted.json();
  assert.ok(taskId);
  assert.equal((await call(`/api/research/status/${taskId}`, { authenticated: false })).status, 401);
  await waitFor(async () => {
    const status = await (await call(`/api/research/status/${taskId}`)).json();
    if (status.status === 'failed') throw new Error('Offline research unexpectedly failed');
    return status.status === 'completed';
  }, 'research completion');
  assert.ok(upstreamCalls > 0);
  assert.match(await (await call(`/api/research/export/${taskId}/markdown`)).text(), /Offline report/);
  const persisted = JSON.parse(await readFile(ledger, 'utf8'));
  assert.match(persisted.find(task => task.id === taskId).resultSha256, /^[a-f0-9]{64}$/);

  rejectUpstream = true;
  const stream = await call('/api/sse', { method: 'POST', body: query });
  assert.equal(stream.status, 200);
  const frames = (await stream.text()).trim().split('\n\n');
  const dataLines = frames.flatMap(frame => frame.split('\n').filter(line => line.startsWith('data: ')));
  dataLines.forEach(line => JSON.parse(line.slice(6)));
  assert.equal(frames.filter(frame => frame.startsWith('event: error\n')).length, 1);

  await stopApp();
  const interruptedId = randomUUID();
  const saved = JSON.parse(await readFile(ledger, 'utf8'));
  saved.push({
    id: interruptedId,
    status: 'in_progress',
    progress: 20,
    parameters: { mode: 'general', ...query },
    createdAt: now,
    updatedAt: now,
    attempts: 1,
    eventSeq: 2,
  });
  await writeFile(ledger, JSON.stringify(saved));
  rejectUpstream = false;
  await startApp();
  await waitFor(async () => {
    const status = await (await call(`/api/research/status/${interruptedId}`)).json();
    if (status.status === 'failed') throw new Error('Recovered task unexpectedly failed');
    return status.status === 'completed';
  }, 'worker startup recovery');
  const restored = await (await call(`/api/research/result/${taskId}`)).json();
  assert.equal(restored.status, 'completed');
  assert.match(restored.result.finalReport, /Offline report/);
  assert.equal(await (await call('/api/mcp/download/legacy-offline-id/report')).text(), report);
  console.log('Standalone smoke passed: authenticated queue, signed proxy, MCP handshake, SSE errors, worker and artifact recovery.');
} catch (error) {
  console.error(output);
  throw error;
} finally {
  await stopApp();
  upstream.close();
  await rm(directory, { recursive: true, force: true });
}
