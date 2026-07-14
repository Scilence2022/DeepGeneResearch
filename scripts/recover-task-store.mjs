#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const VALID_STATUSES = new Set(['pending', 'in_progress', 'completed', 'failed', 'cancel_requested', 'cancelled']);

function parseArguments(argv) {
  const options = { write: false, cancelInterrupted: false, source: '', destination: '' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--write') options.write = true;
    else if (argument === '--cancel-interrupted') options.cancelInterrupted = true;
    else if (argument === '--source' || argument === '--destination') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a path`);
      options[argument.slice(2)] = path.resolve(value);
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      console.log(`Usage: node scripts/recover-task-store.mjs --source <quarantined-ledger> --destination <tasks.json> [--cancel-interrupted] --write

Repairs a task ledger only when it is a valid JSON array with one accidental trailing closing bracket.
The source is never changed. Omit --write to validate and preview the recovery.`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (!options.source || !options.destination) {
    throw new Error('--source and --destination are required; use --help for usage');
  }
  if (options.source === options.destination) throw new Error('source and destination must be different paths');
  return options;
}

function parseRecoverableLedger(contents) {
  const trimmed = contents.trim();
  try {
    return { tasks: JSON.parse(trimmed), repairedTrailingBracket: false };
  } catch (originalError) {
    // A historic writer could leave exactly one extra `]` after a completed
    // root array. Accept only this deterministic, lossless repair shape.
    if (!trimmed.endsWith(']]')) throw originalError;
    const repaired = trimmed.slice(0, -1);
    try {
      return { tasks: JSON.parse(repaired), repairedTrailingBracket: true };
    } catch {
      throw originalError;
    }
  }
}

function validateTasks(tasks) {
  if (!Array.isArray(tasks)) throw new Error('Task ledger root must be a JSON array');
  const ids = new Set();
  const idempotencyKeys = new Set();
  for (const task of tasks) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('Task ledger contains a non-object task');
    if (typeof task.id !== 'string' || !task.id) throw new Error('Task ledger contains a task without an id');
    if (ids.has(task.id)) throw new Error(`Task ledger contains duplicate task id ${task.id}`);
    ids.add(task.id);
    if (!VALID_STATUSES.has(task.status)) throw new Error(`Task ${task.id} has an invalid status`);
    if (!Number.isFinite(task.progress) || task.progress < 0 || task.progress > 100) {
      throw new Error(`Task ${task.id} has an invalid progress value`);
    }
    if (!task.parameters || typeof task.parameters !== 'object') throw new Error(`Task ${task.id} has no parameters`);
    if (typeof task.parameters.geneSymbol !== 'string' || typeof task.parameters.organism !== 'string') {
      throw new Error(`Task ${task.id} is missing geneSymbol or organism`);
    }
    if (Number.isNaN(new Date(task.createdAt).getTime()) || Number.isNaN(new Date(task.updatedAt).getTime())) {
      throw new Error(`Task ${task.id} has invalid timestamps`);
    }
    const key = task.parameters.idempotencyKey;
    if (key) {
      if (idempotencyKeys.has(key)) throw new Error(`Task ledger contains duplicate idempotency key ${key}`);
      idempotencyKeys.add(key);
    }
  }
}

function cancelInterruptedTasks(tasks) {
  const now = new Date().toISOString();
  return tasks.map(task => {
    if (task.status !== 'pending' && task.status !== 'in_progress' && task.status !== 'cancel_requested') return task;
    return {
      ...task,
      status: 'cancelled',
      step: 'cancelled-during-ledger-recovery',
      error: task.error || 'Cancelled during manual task-ledger recovery; rerun explicitly if still needed.',
      updatedAt: now,
      eventSeq: Number.isInteger(task.eventSeq) && task.eventSeq >= 0 ? task.eventSeq + 1 : 1,
    };
  });
}

async function writeAtomically(destination, contents) {
  try {
    await fs.access(destination);
    throw new Error(`Destination already exists: ${destination}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(temporary, destination);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const contents = await fs.readFile(options.source, 'utf8');
  const parsed = parseRecoverableLedger(contents);
  validateTasks(parsed.tasks);
  const tasks = options.cancelInterrupted ? cancelInterruptedTasks(parsed.tasks) : parsed.tasks;
  const summary = tasks.reduce((counts, task) => {
    counts[task.status] = (counts[task.status] || 0) + 1;
    return counts;
  }, {});

  console.log(JSON.stringify({
    source: options.source,
    destination: options.destination,
    taskCount: tasks.length,
    repairedTrailingBracket: parsed.repairedTrailingBracket,
    cancelInterrupted: options.cancelInterrupted,
    statusCounts: summary,
    written: options.write,
  }, null, 2));
  if (!options.write) return;
  await writeAtomically(options.destination, `${JSON.stringify(tasks, null, 2)}\n`);
}

main().catch(error => {
  console.error(`Task-store recovery failed: ${error.message}`);
  process.exitCode = 1;
});
