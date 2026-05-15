import { describe, expect, it } from 'vitest';
import {
  renderSummary,
  resolveRootSpan,
} from '../../../../src/commands/traces/render-summary';
import type { Trace } from '../../../../src/commands/traces/types';

function makeTrace(overrides: Partial<Trace>): Trace {
  return {
    traceId: 'trace_default',
    rootSpanId: 'span_root',
    spans: [
      {
        spanId: 'span_root',
        name: 'GET /api/hello',
        duration: [0, 12_000_000],
        attributes: {
          'http.method': 'GET',
          'http.target': '/api/hello',
          'http.status_code': 200,
        },
        status: { code: 0 },
      },
    ],
    ...overrides,
  };
}

describe('resolveRootSpan', () => {
  it('matches the span with the configured rootSpanId', () => {
    const trace = makeTrace({
      rootSpanId: 'span_other',
      spans: [
        { spanId: 'span_first', name: 'first', duration: [0, 1_000_000] },
        { spanId: 'span_other', name: 'other', duration: [0, 2_000_000] },
      ],
    });
    expect(resolveRootSpan(trace)?.spanId).toBe('span_other');
  });

  it('falls back to the first span when rootSpanId is missing', () => {
    const trace = makeTrace({
      rootSpanId: undefined,
      spans: [
        { spanId: 'span_first', name: 'first', duration: [0, 1_000_000] },
        { spanId: 'span_second', name: 'second', duration: [0, 2_000_000] },
      ],
    });
    expect(resolveRootSpan(trace)?.spanId).toBe('span_first');
  });

  it('falls back to the first span when rootSpanId does not match any span', () => {
    const trace = makeTrace({
      rootSpanId: 'span_missing',
      spans: [
        { spanId: 'span_first', name: 'first', duration: [0, 1_000_000] },
      ],
    });
    expect(resolveRootSpan(trace)?.spanId).toBe('span_first');
  });

  it('returns undefined when there are no spans', () => {
    const trace = makeTrace({ rootSpanId: undefined, spans: [] });
    expect(resolveRootSpan(trace)).toBeUndefined();
  });
});

describe('renderSummary', () => {
  it('renders every summary field for a happy-path trace', () => {
    const trace = makeTrace({});
    const out = renderSummary(trace, { requestId: 'req_abc' });
    expect(out).toContain('Trace id:     trace_default');
    expect(out).toContain('Request id:   req_abc');
    expect(out).toContain('Status:       200');
    expect(out).toContain('Method/path:  GET /api/hello');
    expect(out).toContain('Duration:     12ms');
    expect(out).toContain('Cold start:   no');
    expect(out).toContain('Spans:        1');
    expect(out).toContain('Errors:       0');
  });

  it('uses the first span as a fallback when rootSpanId is missing', () => {
    const trace = makeTrace({
      rootSpanId: undefined,
      spans: [
        {
          spanId: 'first',
          name: 'GET /api/fallback',
          duration: [1, 500_000_000],
          attributes: {
            'http.method': 'POST',
            'http.target': '/api/fallback',
            'http.status_code': 201,
          },
        },
        {
          spanId: 'second',
          name: 'lower',
          duration: [0, 1_000_000],
        },
      ],
    });
    const out = renderSummary(trace, { requestId: 'req_fb' });
    expect(out).toContain('Status:       201');
    expect(out).toContain('Method/path:  POST /api/fallback');
    expect(out).toContain('Duration:     1500ms');
    expect(out).toContain('Spans:        2');
  });

  it('renders unknown for missing http attributes', () => {
    const trace = makeTrace({
      spans: [
        {
          spanId: 'span_root',
          name: 'root',
          duration: [0, 5_000_000],
        },
      ],
    });
    const out = renderSummary(trace, { requestId: 'req_x' });
    expect(out).toContain('Status:       <unknown>');
    expect(out).toContain('Method/path:  <unknown>');
    expect(out).toContain('Duration:     5ms');
  });

  it('reports cold start when any span has func.cold true', () => {
    const trace = makeTrace({
      spans: [
        {
          spanId: 'span_root',
          name: 'root',
          duration: [0, 5_000_000],
          attributes: {},
        },
        {
          spanId: 'span_child',
          name: 'invoke',
          duration: [0, 1_000_000],
          attributes: { 'func.cold': true },
        },
      ],
    });
    const out = renderSummary(trace, { requestId: 'req_cold' });
    expect(out).toContain('Cold start:   yes');
    expect(out).toContain('Spans:        2');
  });

  it('counts only spans with status code 1 as errors', () => {
    const trace = makeTrace({
      spans: [
        {
          spanId: 'span_root',
          name: 'root',
          duration: [0, 1_000_000],
          status: { code: 0 },
        },
        {
          spanId: 'span_err1',
          name: 'err1',
          duration: [0, 1_000_000],
          status: { code: 1 },
        },
        {
          spanId: 'span_err2',
          name: 'err2',
          duration: [0, 1_000_000],
          status: { code: 1, message: 'boom' },
        },
        {
          spanId: 'span_ok',
          name: 'ok',
          duration: [0, 1_000_000],
          status: { code: 0 },
        },
      ],
    });
    const out = renderSummary(trace, { requestId: 'req_err' });
    expect(out).toContain('Errors:       2');
  });

  it('handles a missing duration tuple gracefully', () => {
    const trace = makeTrace({
      spans: [
        {
          spanId: 'span_root',
          name: 'root',
          duration: undefined as unknown as [number, number],
        },
      ],
    });
    const out = renderSummary(trace, { requestId: 'req_nd' });
    expect(out).toContain('Duration:     <unknown>');
  });

  it('accepts numeric http.status_code attribute', () => {
    const trace = makeTrace({
      spans: [
        {
          spanId: 'span_root',
          name: 'root',
          duration: [0, 1_000_000],
          attributes: { 'http.status_code': 500 },
        },
      ],
    });
    const out = renderSummary(trace, { requestId: 'req_500' });
    expect(out).toContain('Status:       500');
  });
});
