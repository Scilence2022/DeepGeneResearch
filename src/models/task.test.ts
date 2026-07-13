import { describe, expect, it } from 'vitest';
import { createTask, updateTaskError, updateTaskResult, updateTaskStatus } from './task';

describe('gene research task state machine', () => {
  it('makes terminal states immutable', () => {
    const pending = createTask({ geneSymbol: 'thrL', organism: 'Escherichia coli' });
    const running = updateTaskStatus(pending, 'in_progress', 20, 'research');
    const completed = updateTaskResult(running, { finalReport: 'done' });

    expect(updateTaskStatus(completed, 'in_progress', 80, 'late-progress')).toBe(completed);
    expect(updateTaskError(completed, 'late failure')).toBe(completed);
  });

  it('gives cancellation precedence over completion', () => {
    const pending = createTask({ geneSymbol: 'thrL', organism: 'Escherichia coli' });
    const running = updateTaskStatus(pending, 'in_progress', 20, 'research');
    const cancellation = updateTaskStatus(running, 'cancel_requested', undefined, 'cancel-requested');

    expect(updateTaskResult(cancellation, { finalReport: 'late result' })).toBe(cancellation);
    expect(updateTaskStatus(cancellation, 'cancelled', 20, 'cancelled').status).toBe('cancelled');
  });
});
