import { afterEach, describe, expect, test, vi } from 'vitest';
import { metric } from '../../src/metric';

const RUSTY_RUNTIME_IPC_SYMBOL = Symbol.for('@vercel/rusty-runtime-ipc');
const globalSymbols = globalThis as unknown as Record<symbol, unknown>;

describe('metric', () => {
  afterEach(() => {
    delete globalSymbols[RUSTY_RUNTIME_IPC_SYMBOL];
  });

  test('sends a metric through the rusty runtime IPC hook', () => {
    const sendMetric = vi.fn();
    globalSymbols[RUSTY_RUNTIME_IPC_SYMBOL] = { sendMetric };

    metric('tinybird.query_ms', 100, {
      query: 'getUser',
    });

    expect(sendMetric).toHaveBeenCalledOnce();
    expect(sendMetric).toHaveBeenCalledWith('tinybird.query_ms', 100, {
      query: 'getUser',
    });
  });

  test('supports metrics without tags', () => {
    const sendMetric = vi.fn();
    globalSymbols[RUSTY_RUNTIME_IPC_SYMBOL] = { sendMetric };

    metric('tinybird.query_ms', 100);

    expect(sendMetric).toHaveBeenCalledWith(
      'tinybird.query_ms',
      100,
      undefined
    );
  });

  test('is a no-op when the runtime does not support metrics', () => {
    expect(() => metric('tinybird.query_ms', 100)).not.toThrow();

    globalSymbols[RUSTY_RUNTIME_IPC_SYMBOL] = {};

    expect(() => metric('tinybird.query_ms', 100)).not.toThrow();
  });
});
