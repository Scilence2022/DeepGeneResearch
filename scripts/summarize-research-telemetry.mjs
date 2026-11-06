import { createInterface } from 'node:readline';

const metrics = { queueMs: [], durationMs: [], cancellationMs: [], artifactBytes: [] };
const totals = { started: 0, completed: 0, failed: 0, cancelled: 0, replayed: 0, incompleteCost: 0 };
const usdByRateVersion = new Map();
const phaseTimes = new Map();
const validNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
for await (const line of createInterface({ input: process.stdin })) {
  let row;
  try {
    row = JSON.parse(line);
  } catch {
    continue;
  }
  if (row?.schema !== 'dgr.research-event.v1' || !['started', 'completed', 'failed', 'cancelled'].includes(row.event)) continue;
  totals[row.event]++;
  if (row.event === 'started' && validNumber(row.queueMs)) metrics.queueMs.push(row.queueMs);
  if (row.event === 'cancelled' && validNumber(row.durationMs)) metrics.cancellationMs.push(row.durationMs);
  if (row.event === 'completed') {
    if (validNumber(row.durationMs)) metrics.durationMs.push(row.durationMs);
    if (validNumber(row.artifactBytes)) metrics.artifactBytes.push(row.artifactBytes);
    if (row.cacheReplay) totals.replayed++;
    if (row.costIncomplete) totals.incompleteCost++;
    if (validNumber(row.estimatedUsd) && typeof row.rateVersion === 'string') {
      usdByRateVersion.set(row.rateVersion, (usdByRateVersion.get(row.rateVersion) ?? 0) + row.estimatedUsd);
    }
    for (const [phase, elapsed] of Object.entries(row.phaseMs ?? {})) {
      if (!validNumber(elapsed)) continue;
      if (!phaseTimes.has(phase)) phaseTimes.set(phase, []);
      phaseTimes.get(phase).push(elapsed);
    }
  }
}
const percentile = values => {
  values.sort((a, b) => a - b);
  return { samples: values.length, p95: values.length ? values[Math.ceil(values.length * 0.95) - 1] : null };
};
console.log(JSON.stringify({
  schema: 'dgr.research-telemetry-summary.v1',
  totals,
  metrics: Object.fromEntries(Object.entries(metrics).map(([key, values]) => [key, percentile(values)])),
  phaseMs: Object.fromEntries([...phaseTimes].map(([phase, values]) => [phase, percentile(values)])),
  estimatedUsdByRateVersion: Object.fromEntries(usdByRateVersion),
}, null, 2));
