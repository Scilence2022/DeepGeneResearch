import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const identifier = value => String(value ?? '').trim().toLowerCase().replace(/^https?:\/\/(?:dx\.)?doi\.org\//, '');
const credentialParameters = /^(?:api[_-]?key|access[_-]?token|authorization|password|secret|token|signature|x-amz-signature|x-amz-credential)$/i;

function hasCredentialUrl(value) {
  for (const candidate of value.matchAll(/https?:\/\/[^\s<>"`]+/gi)) {
    try {
      const url = new URL(candidate[0]);
      if (url.username || url.password || [...url.searchParams.keys()].some(key => credentialParameters.test(key))) return true;
    } catch {
      // Ignore malformed URLs.
    }
  }
  return false;
}

export function auditArtifact(artifact) {
  const issues = new Set();
  const pending = [artifact];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === 'string') {
      if (hasCredentialUrl(value)) issues.add('credential-url');
      continue;
    }
    if (!value || typeof value !== 'object') continue;
    const document = value.fullText;
    if (document && typeof document === 'object') {
      const reference = value.structuredData?.literatureReferences?.[0];
      for (const key of ['pmid', 'pmcid', 'doi']) {
        const parent = identifier(value[key] ?? reference?.[key] ??
          (key === 'pmid' && value.provenance?.provider === 'pubmed' ? value.provenance.recordId : undefined));
        const child = identifier(document.identifiers?.[key]);
        if (parent && child && parent !== child) issues.add('work-identifier-conflict');
      }
      if (document.origin === 'snippet') issues.add('legacy-snippet-binding');
    }
    if (value.sourceOrigin === 'snippet' && value.kind === 'full_text_span') issues.add('legacy-snippet-binding');
    for (const child of Object.values(value)) pending.push(child);
  }
  return [...issues].sort();
}

export async function auditLedger(filename) {
  const ledger = JSON.parse(await readFile(filename, 'utf8'));
  if (!Array.isArray(ledger)) throw new Error('Expected a task ledger array');
  const flagged = [];
  for (const [index, task] of ledger.entries()) {
    const issues = new Set(auditArtifact(task));
    if (task?.resultSha256) {
      try {
        if (!/^[a-f0-9]{64}$/.test(task.resultSha256)) throw new Error();
        const bytes = await readFile(path.join(path.dirname(filename), 'research-results', task.resultSha256 + '.json'));
        if (hash(bytes) !== task.resultSha256) throw new Error();
        for (const issue of auditArtifact(JSON.parse(bytes))) issues.add(issue);
      } catch {
        issues.add('unreadable-or-invalid-result');
      }
    }
    if (issues.size) flagged.push({
      index,
      taskId: typeof task?.id === 'string' && /^[a-f0-9-]{36}$/i.test(task.id) ? task.id : null,
      issues: [...issues].sort(),
    });
  }
  return { schema: 'dgr.archive-audit.v1', scanned: ledger.length, flagged };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 3) throw new Error();
    const report = await auditLedger(process.argv[2]);
    console.log(JSON.stringify(report, null, 2));
    if (report.flagged.length) process.exitCode = 2;
  } catch {
    console.error('Archive audit could not read a task ledger. Usage: node scripts/audit-research-archives.mjs /path/to/tasks.json');
    process.exitCode = 1;
  }
}
