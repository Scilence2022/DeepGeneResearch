import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const exceptions = [
  {
    advisory: 'GHSA-mrhx-c7xc-m3w5',
    package: 'zod',
    version: '3.25.76',
    owner: 'DGR maintainers',
    expires: '2027-02-01',
    mitigation: 'Pinned collection-size backport and bounded HTTP JSON validation',
  },
];

const audit = spawnSync('pnpm', ['audit', '--prod', '--json'], { encoding: 'utf8' });
const report = JSON.parse(audit.stdout || '{}');
if (audit.error || !report.metadata?.vulnerabilities || !report.advisories) {
  throw new Error('Production dependency audit failed to return an advisory report');
}
const patch = 'patches/zod@3.25.76.patch';
const lockfile = readFileSync(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
const hasMitigation = lockfile.includes('path: ' + patch) &&
  createHash('sha256').update(readFileSync(new URL('../' + patch, import.meta.url))).digest('hex') ===
    '1ec6059f4a0121a63be531682aaae4510d72d37c78cb4ac923f34e4600ebad55';
const today = new Date().toISOString().slice(0, 10);
const blocked = [];
for (const advisory of Object.values(report.advisories)) {
  if (!['high', 'critical'].includes(advisory.severity)) continue;
  const finding = exceptions.find(exception =>
    advisory.url?.endsWith('/' + exception.advisory) &&
    advisory.module_name === exception.package &&
    advisory.findings?.length > 0 &&
    advisory.findings.every(item => item.version === exception.version) &&
    exception.expires > today,
  );
  if (advisory.severity === 'high' && finding && hasMitigation) {
    console.log(`Temporary exception for ${finding.advisory} until ${finding.expires}. ${finding.mitigation}. Owner: ${finding.owner}.`);
  } else {
    blocked.push(advisory.url || advisory.title);
  }
}
if (blocked.length) {
  console.error('Production dependency audit blocked by:', blocked.join('\n'));
  process.exitCode = 1;
}
