import { afterEach, describe, expect, test, vi } from 'vitest';

import { SYMBOL_FOR_REQ_CONTEXT } from '../../src/get-context';
import { createRootSpan } from '../../src/spans';
import type { Spans } from '../../src/spans';

describe('spans', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete getGlobalWithRequestContext()[SYMBOL_FOR_REQ_CONTEXT];
  });

  test('deduplicates attributes by key', () => {
    const reportSpans = vi.fn();
    getGlobalWithRequestContext()[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({
        telemetry: {
          reportSpans,
          rootSpanContext: {
            traceId: '1090b9fa2acf82acda24bd0ee9c02d60',
            spanId: '72a047241e92ec7f',
          },
        },
      }),
    };

    createRootSpan('test')
      .setAttribute('foo', 'old')
      .setAttribute('bar', true)
      .setAttribute('foo', 'new')
      .end();

    const span = getReportedSpan(reportSpans);
    expect(span.attributes).toEqual([
      { key: 'foo', value: { stringValue: 'new' } },
      { key: 'bar', value: { boolValue: true } },
    ]);
  });

  test('only reports once when ended multiple times', () => {
    const reportSpans = vi.fn();
    getGlobalWithRequestContext()[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({
        telemetry: {
          reportSpans,
          rootSpanContext: {
            traceId: '1090b9fa2acf82acda24bd0ee9c02d60',
            spanId: '72a047241e92ec7f',
          },
        },
      }),
    };

    const span = createRootSpan('test');
    span.end();
    span.end();

    expect(reportSpans).toHaveBeenCalledTimes(1);
  });

  test('noops when telemetry is missing', () => {
    getGlobalWithRequestContext()[SYMBOL_FOR_REQ_CONTEXT] = {
      get: () => ({}),
    };

    expect(() => {
      createRootSpan('test')
        .setAttribute('foo', 'bar')
        .setAttributes({ baz: 1 })
        .createSpan('child')
        .end();
    }).not.toThrow();
  });
});

function getGlobalWithRequestContext(): typeof globalThis & {
  [SYMBOL_FOR_REQ_CONTEXT]?: unknown;
} {
  return globalThis;
}

function getReportedSpan(reportSpans: ReturnType<typeof vi.fn>) {
  const payload = reportSpans.mock.calls[0][0] as Spans;
  const span = payload.resourceSpans?.[0]?.scopeSpans[0]?.spans?.[0];

  if (!span) {
    throw new Error('No span reported');
  }

  return span;
}
