import { describe, expect, it } from 'vitest';
import {
  analyze,
  getDurationUs,
  resolveRootSpan,
} from '../../../../src/commands/traces/analyze';
import type { Span, Trace } from '../../../../src/commands/traces/types';

function span(overrides: Partial<Span> & { spanId: string }): Span {
  return {
    name: overrides.spanId,
    duration: [0, 1_000_000],
    ...overrides,
  } as Span;
}

function trace(spans: Span[], rootSpanId?: string): Trace {
  return {
    traceId: 'trace_x',
    rootSpanId,
    spans,
  };
}

describe('getDurationUs', () => {
  it('converts a [seconds, nanoseconds] tuple to microseconds', () => {
    expect(
      getDurationUs({ spanId: 's', name: 's', duration: [1, 500_000] })
    ).toBe(1_000_500);
  });

  it('returns null for a missing duration', () => {
    expect(
      getDurationUs({
        spanId: 's',
        name: 's',
        duration: undefined as unknown as [number, number],
      })
    ).toBeNull();
  });

  it('clamps negative durations to 0', () => {
    expect(getDurationUs({ spanId: 's', name: 's', duration: [-1, 0] })).toBe(
      0
    );
  });
});

describe('resolveRootSpan', () => {
  it('matches the span with the configured rootSpanId', () => {
    const t = trace(
      [span({ spanId: 'first' }), span({ spanId: 'second' })],
      'second'
    );
    expect(resolveRootSpan(t)?.spanId).toBe('second');
  });

  it('falls back to the first span when rootSpanId is missing', () => {
    const t = trace([span({ spanId: 'first' }), span({ spanId: 'second' })]);
    expect(resolveRootSpan(t)?.spanId).toBe('first');
  });

  it('falls back to the first span when rootSpanId does not match', () => {
    const t = trace([span({ spanId: 'first' })], 'missing');
    expect(resolveRootSpan(t)?.spanId).toBe('first');
  });

  it('returns undefined when there are no spans', () => {
    expect(resolveRootSpan(trace([]))).toBeUndefined();
  });
});

describe('analyze', () => {
  it('computes self-time as duration minus direct children duration', () => {
    const t = trace(
      [
        span({
          spanId: 'root',
          duration: [0, 1_000_000_000], // 1s = 1_000_000us
          startTime: [0, 0],
        }),
        span({
          spanId: 'child',
          parentSpanId: 'root',
          duration: [0, 200_000_000], // 200ms = 200_000us
          startTime: [0, 100_000_000],
        }),
      ],
      'root'
    );
    const a = analyze(t);
    expect(a.spanInfo.get('root')?.durationUs).toBe(1_000_000);
    expect(a.spanInfo.get('root')?.selfTimeUs).toBe(800_000);
    expect(a.spanInfo.get('child')?.selfTimeUs).toBe(200_000);
  });

  it('clamps negative self-time to 0 when children overlap parent', () => {
    const t = trace(
      [
        span({
          spanId: 'root',
          duration: [0, 100_000_000], // 100ms
          startTime: [0, 0],
        }),
        span({
          spanId: 'a',
          parentSpanId: 'root',
          duration: [0, 80_000_000], // 80ms
        }),
        span({
          spanId: 'b',
          parentSpanId: 'root',
          duration: [0, 80_000_000], // 80ms
        }),
      ],
      'root'
    );
    const a = analyze(t);
    // children sum to 160ms > 100ms parent → self-time clamps to 0
    expect(a.spanInfo.get('root')?.selfTimeUs).toBe(0);
  });

  it('computes start offsets relative to the root start time', () => {
    const t = trace(
      [
        span({
          spanId: 'root',
          startTime: [10, 0],
          duration: [0, 100_000_000],
        }),
        span({
          spanId: 'child',
          parentSpanId: 'root',
          startTime: [10, 50_000_000], // 50ms after root start
          duration: [0, 10_000_000],
        }),
      ],
      'root'
    );
    const a = analyze(t);
    expect(a.spanInfo.get('root')?.startOffsetUs).toBe(0);
    expect(a.spanInfo.get('child')?.startOffsetUs).toBe(50_000);
  });

  it('omits offsets when root has no startTime', () => {
    const t = trace(
      [
        span({ spanId: 'root', duration: [0, 100_000_000] }),
        span({
          spanId: 'child',
          parentSpanId: 'root',
          startTime: [10, 0],
          duration: [0, 10_000_000],
        }),
      ],
      'root'
    );
    const a = analyze(t);
    expect(a.rootStartUs).toBeNull();
    expect(a.spanInfo.get('child')?.startOffsetUs).toBeNull();
  });

  it('sorts siblings by start time within the tree walk', () => {
    const t = trace(
      [
        span({ spanId: 'root', startTime: [0, 0], duration: [0, 100_000_000] }),
        span({
          spanId: 'late',
          parentSpanId: 'root',
          startTime: [0, 50_000_000],
        }),
        span({
          spanId: 'early',
          parentSpanId: 'root',
          startTime: [0, 10_000_000],
        }),
      ],
      'root'
    );
    const a = analyze(t);
    const ids = a.treeOrder.map(n => n.span.spanId);
    expect(ids).toEqual(['root', 'early', 'late']);
  });

  it('aggregates repeated operations sorted by total descending', () => {
    const t = trace([
      span({ spanId: 'r', name: 'root', duration: [0, 500_000_000] }),
      span({ spanId: 'a', name: 'db.query', duration: [0, 50_000_000] }),
      span({ spanId: 'b', name: 'db.query', duration: [0, 50_000_000] }),
      span({ spanId: 'c', name: 'fetch', duration: [0, 200_000_000] }),
      span({ spanId: 'd', name: 'fetch', duration: [0, 200_000_000] }),
      span({ spanId: 'e', name: 'one-off', duration: [0, 1_000_000] }),
    ]);
    const a = analyze(t);
    expect(a.repeatedOps.map(op => op.name)).toEqual(['fetch', 'db.query']);
    expect(a.repeatedOps[0]).toMatchObject({
      name: 'fetch',
      count: 2,
      totalUs: 400_000,
      perCallUs: 200_000,
    });
    // one-off appears only once → excluded
    expect(a.repeatedOps.find(op => op.name === 'one-off')).toBeUndefined();
  });

  it('collects error spans by status code', () => {
    const t = trace([
      span({ spanId: 'r', status: { code: 0 } }),
      span({ spanId: 'e1', status: { code: 1, message: 'boom' } }),
      span({ spanId: 'e2', status: { code: 1 } }),
    ]);
    const a = analyze(t);
    expect(a.errorSpans.map(s => s.spanId)).toEqual(['e1', 'e2']);
  });

  it('groups orphan spans (parent missing from set) under orphanOrder', () => {
    const t = trace(
      [
        span({ spanId: 'root' }),
        span({ spanId: 'orphan-root', parentSpanId: 'missing' }),
        span({ spanId: 'orphan-child', parentSpanId: 'orphan-root' }),
      ],
      'root'
    );
    const a = analyze(t);
    expect(a.treeOrder.map(n => n.span.spanId)).toEqual(['root']);
    expect(a.orphanOrder.map(n => n.span.spanId)).toEqual([
      'orphan-root',
      'orphan-child',
    ]);
  });

  it('puts additional parentless spans (besides chosen root) into orphans', () => {
    const t = trace(
      [
        span({ spanId: 'root' }),
        span({ spanId: 'other-root' }), // no parentSpanId, but not the chosen root
      ],
      'root'
    );
    const a = analyze(t);
    expect(a.treeOrder.map(n => n.span.spanId)).toEqual(['root']);
    expect(a.orphanOrder.map(n => n.span.spanId)).toEqual(['other-root']);
  });

  it('surfaces cycle members as flat orphan rows', () => {
    const t = trace(
      [
        span({ spanId: 'root' }),
        // a → b → a cycle, neither reachable from root
        span({ spanId: 'a', parentSpanId: 'b' }),
        span({ spanId: 'b', parentSpanId: 'a' }),
      ],
      'root'
    );
    const a = analyze(t);
    expect(a.treeOrder.map(n => n.span.spanId)).toEqual(['root']);
    const orphanIds = a.orphanOrder.map(n => n.span.spanId).sort();
    expect(orphanIds).toEqual(['a', 'b']);
  });

  it('handles an empty trace gracefully', () => {
    const a = analyze(trace([]));
    expect(a.root).toBeUndefined();
    expect(a.rootDurationUs).toBeNull();
    expect(a.treeOrder).toEqual([]);
    expect(a.orphanOrder).toEqual([]);
    expect(a.errorSpans).toEqual([]);
    expect(a.repeatedOps).toEqual([]);
  });
});
