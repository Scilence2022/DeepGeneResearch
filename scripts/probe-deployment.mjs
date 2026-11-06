import assert from 'node:assert/strict';

const base = new URL(process.env.DGR_PROBE_URL || 'http://127.0.0.1:3000');
const mode = process.env.DGR_PROBE_MODE || 'worker';
const token = process.env.DGR_PROBE_TOKEN;
assert.ok(['worker', 'static'].includes(mode), 'DGR_PROBE_MODE must be worker or static');
assert.ok(base.protocol === 'https:' || (base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)),
  'A public probe requires HTTPS');
assert.ok(!base.username && !base.password && !base.search && !base.hash, 'Probe URL must not contain credentials');
const fetchProbe = (route, init = {}) => fetch(new URL(route, base), {
  ...init, redirect: 'error', signal: AbortSignal.timeout(20_000),
});

assert.equal((await fetchProbe('/')).status, 200);
if (mode === 'worker') {
  assert.ok(token, 'Set DGR_PROBE_TOKEN in the process environment');
  assert.equal((await fetchProbe('/api/mcp/tasks')).status, 401);
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  const rpc = (method, params) => fetchProbe('/api/mcp', {
    method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const initialize = await rpc('initialize', {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'dgr-deployment-probe', version: '1' },
  });
  assert.equal(initialize.status, 200);
  assert.equal((await initialize.json()).result?.protocolVersion, '2025-03-26');
  if (process.env.DGR_PROBE_LIVE_PROVIDER === '1') {
    const response = await rpc('tools/call', {
      name: 'write-research-plan',
      arguments: { query: 'Outline a short literature search for bacterial aspartokinase. No private data.', maxResult: 1 },
    });
    assert.equal(response.status, 200);
    const { result } = await response.json();
    assert.ok(result && !result.isError && result.content?.some(item => item.type === 'text' && item.text), 'Provider probe failed');
  }
} else {
  const taskEndpoint = await fetchProbe('/api/mcp/tasks');
  assert.ok([404, 405].includes(taskEndpoint.status), 'Static hosting must not expose a durable worker API');
}
console.log(JSON.stringify({ mode, liveProvider: mode === 'worker' && process.env.DGR_PROBE_LIVE_PROVIDER === '1', status: 'passed' }));
