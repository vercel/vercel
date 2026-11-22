import { afterEach, describe, expect, it, vi } from 'vitest';
import { eventRequest } from '../../src/internal/event-request.js';

afterEach(() => vi.useRealTimers());

describe('event request deadlines', () => {
  it.each([
    { timeout: 100 },
    { maxTotalTimeout: 100 },
    { timeout: 200, maxTotalTimeout: 100 },
    { timeout: 100, maxTotalTimeout: 200 },
  ])('uses the earlier supplied deadline %j', async options => {
    vi.useFakeTimers();
    let receivedSignal: AbortSignal | undefined;
    const pending = eventRequest(options, signal => {
      receivedSignal = signal;
      return new Promise(() => {});
    });
    const rejected = expect(pending).rejects.toMatchObject({
      name: 'TimeoutError',
    });
    await vi.advanceTimersByTimeAsync(99);
    expect(receivedSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejected;
    expect(receivedSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the caller abort reason while a deadline is active', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const pending = eventRequest(
      { signal: controller.signal, timeout: 100 },
      signal => {
        receivedSignal = signal;
        return new Promise(() => {});
      }
    );
    const reason = new Error('cancelled');
    const rejected = expect(pending).rejects.toBe(reason);
    controller.abort(reason);
    await rejected;
    expect(receivedSignal?.reason).toBe(reason);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    0,
    -1,
    NaN,
    Infinity,
    1.5,
    2_147_483_648,
  ])('rejects invalid deadline %s without starting work', async timeout => {
    const run = vi.fn();
    await expect(eventRequest({ timeout }, run)).rejects.toThrow(TypeError);
    await expect(
      eventRequest({ maxTotalTimeout: timeout }, run)
    ).rejects.toThrow(TypeError);
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    'resolve',
    'reject',
  ] as const)('cleans up timers and listeners on %s', async outcome => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, 'addEventListener');
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const failure = new Error('failure');
    const request = eventRequest(
      { signal: controller.signal, timeout: 100 },
      async () => {
        if (outcome === 'reject') throw failure;
        return 'done';
      }
    );
    if (outcome === 'reject') await expect(request).rejects.toBe(failure);
    else await expect(request).resolves.toBe('done');
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', add.mock.calls[0][1]);
  });
});
