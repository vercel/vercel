import { describe, expect, test, vi } from 'vitest';
import { Awaiter } from '../../src/awaiter';

describe('Awaiter contract', () => {
  test('waits for tracked work', async () => {
    const awaiter = new Awaiter();
    let completed = false;
    awaiter.waitUntil(
      Promise.resolve().then(() => {
        completed = true;
      })
    );

    await awaiter.awaiting();

    expect(completed).toBe(true);
  });

  test('waits for work added while the first batch is resolving', async () => {
    const awaiter = new Awaiter();
    const completed: string[] = [];
    awaiter.waitUntil(
      Promise.resolve().then(() => {
        completed.push('first');
        awaiter.waitUntil(
          Promise.resolve().then(() => {
            completed.push('second');
          })
        );
      })
    );

    await awaiter.awaiting();

    expect(completed).toEqual(['first', 'second']);
  });

  test('reports rejected work without rejecting shutdown', async () => {
    const onError = vi.fn();
    const error = new Error('background failure');
    const awaiter = new Awaiter({ onError });
    awaiter.waitUntil(Promise.reject(error));

    await expect(awaiter.awaiting()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(error);
  });
});
