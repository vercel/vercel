import chalk from 'chalk';
import { describe, expect, it } from 'vitest';
import {
  buildTreeLabels,
  renderCoverageBar,
  renderSpanBar,
  renderWaterfall,
} from '../../../../src/commands/traces/render-waterfall';
import { analyze, collapseRows } from '../../../../src/commands/traces/analyze';
import type { Span, Trace } from '../../../../src/commands/traces/types';

const REQUEST_ID = 'req_abc123';

function ms(n: number): [number, number] {
  return [Math.floor(n / 1000), (n % 1000) * 1_000_000];
}

function span(
  spanId: string,
  parentSpanId: string | undefined,
  name: string,
  start: number,
  duration: number,
  extra: Partial<Span> = {}
): Span {
  return {
    spanId,
    parentSpanId,
    name,
    startTime: ms(start),
    duration: ms(duration),
    status: { code: 'Unset' },
    ...extra,
  };
}

describe('renderWaterfall', () => {
  it('renders a waterfall chart with tree connectors, errors, and repeats', () => {
    const trace: Trace = {
      traceId: 'trace_abcdef0123456789',
      rootSpanId: 'root',
      spans: [
        span('root', undefined, 'GET /api/hello', 0, 400, {
          attributes: {
            'http.method': 'GET',
            'http.target': '/api/hello',
            'http.status_code': 200,
          },
        }),
        span('mw', 'root', 'middleware', 0, 40),
        span('auth', 'mw', 'auth', 10, 20),
        span('q1', 'root', 'db.query', 50, 50),
        span('q2', 'root', 'db.query', 100, 50),
        span('fetch', 'root', 'fetch upstream', 200, 200, {
          attributes: { 'http.url': 'https://api.example.com/users' },
          status: { code: 'Error', message: '503 Service Unavailable' },
        }),
      ],
    };
    expect(
      renderWaterfall(trace, { requestId: REQUEST_ID, columns: 84 }).split('\n')
    ).toEqual([
      '  Trace           trace_abcdef0123456789',
      '  Request         req_abc123',
      '  Endpoint        GET /api/hello → 200',
      '  Duration        400.0ms',
      '  Spans           6 · 1 error',
      '',
      '  Errors',
      '✗ fetch upstream · 503 Service Unavailable',
      '    http.url          https://api.example.com/users',
      '',
      '  Repeated operations',
      '  db.query          2×  100.0ms  50.0ms each  ███████░░░░░░░░░░░░░░░░░░░░░░  25%',
      '',
      '  Span               Duration  0ms                  200.0ms              400.0ms',
      '                               ├───────────┼───────────┼───────────┼───────────┤',
      '  GET /api/hello      400.0ms  █████████████████████████████████████████████████',
      '  ├─ middleware        40.0ms  ████▉',
      '  │  └─ auth           20.0ms   ██▌',
      '  ├─ db.query ×2      100.0ms        ▉███████████▍',
      '✗ └─ fetch upstream   200.0ms                          ████████████████████████▌',
      '',
    ]);
  });

  it('extends the timeline for spans that outlive the root', () => {
    const trace: Trace = {
      traceId: 't',
      rootSpanId: 'root',
      spans: [
        span('root', undefined, 'root', 0, 100),
        span('bg', 'root', 'waitUntil', 50, 150),
      ],
    };
    const out = renderWaterfall(trace, { requestId: REQUEST_ID, columns: 84 });
    expect(out).toContain('200.0ms\n');
    // Root ends at 25 of 50 cells; the background span starts at cell 12.
    expect(out).toMatch(/\n {2}root\s+100\.0ms {2}█{25}\n/);
    expect(out).toMatch(/└─ waitUntil\s+150\.0ms {14}█{37}▌\n/);
  });

  it('falls back to duration bars when spans have no start times', () => {
    const trace: Trace = {
      traceId: 't',
      rootSpanId: 'root',
      spans: [
        { spanId: 'root', name: 'root', duration: ms(100) },
        {
          spanId: 'child',
          parentSpanId: 'root',
          name: 'child',
          duration: ms(50),
        },
      ],
    };
    const out = renderWaterfall(trace, { requestId: REQUEST_ID, columns: 84 });
    expect(out).toMatch(/└─ child\s+50\.0ms {2}█{25}\n/);
  });

  it('renders orphan spans in their own section', () => {
    const trace: Trace = {
      traceId: 't',
      rootSpanId: 'root',
      spans: [
        span('root', undefined, 'root', 0, 100),
        span('orphan', 'missing', 'lost span', 10, 10),
      ],
    };
    const out = renderWaterfall(trace, { requestId: REQUEST_ID, columns: 84 });
    expect(out).toContain('\n\n  Orphan spans\n  lost span');
  });

  it('says so when the trace has no spans', () => {
    const out = renderWaterfall(
      { traceId: 't', spans: [] },
      { requestId: REQUEST_ID }
    );
    expect(out).toContain('  No spans.');
    expect(out).not.toContain('Duration  0ms');
  });

  it('stretches to fill wide terminals, leaving a right margin', () => {
    const trace: Trace = {
      traceId: 't',
      rootSpanId: 'root',
      spans: [
        span('root', undefined, 'root', 0, 100),
        span('q1', 'root', 'db.query', 0, 10),
        span('q2', 'root', 'db.query', 50, 10),
      ],
    };
    const lines = renderWaterfall(trace, {
      requestId: REQUEST_ID,
      columns: 200,
    }).split('\n');
    const widest = Math.max(...lines.map(line => line.length));
    expect(widest).toBe(196);
    expect(lines.find(line => line.startsWith('  root '))).toHaveLength(196);
  });

  it('colors bars by service and status like the dashboard', () => {
    const trace: Trace = {
      traceId: 't',
      rootSpanId: 'root',
      spans: [
        span('root', undefined, 'GET /api', 0, 100, {
          serviceName: 'vercel.proxy',
        }),
        // Invocations carry the request, so they count as the user's code.
        span('inv', 'root', 'invoke', 0, 90, {
          serviceName: 'vercel.serverless-runtime',
          attributes: { 'http.method': 'GET' },
        }),
        span('q1', 'inv', 'db.query', 10, 10, { serviceName: 'my-app' }),
        span('q2', 'inv', 'db.query', 30, 10, { serviceName: 'my-app' }),
        span('c1', 'inv', 'cache.get', 45, 5, { serviceName: 'redis' }),
        span('f1', 'inv', 'charge', 50, 10, {
          serviceName: 'my-app',
          status: { code: 'Error' },
        }),
        span('k1', 'inv', 'notify', 60, 10, {
          serviceName: 'redis',
          status: { code: 'Ok' },
        }),
      ],
    };
    const previousLevel = chalk.level;
    chalk.level = 1;
    try {
      const lines = renderWaterfall(trace, {
        requestId: REQUEST_ID,
        columns: 84,
      }).split('\n');
      const barColor = (line: string) =>
        /\u001b\[(\d+)m *[█-▏]/.exec(line)?.[1];
      const plain = (line: string) => line.replace(/\u001b\[\d+m/g, '');
      const chart = lines.slice(
        lines.findIndex(l => plain(l).startsWith('  Span '))
      );
      const row = (name: string) =>
        chart.find(l => plain(l).includes(`${name} `)) ?? '';

      // Vercel infrastructure is gray with a `▲` prefix.
      expect(plain(row('GET /api'))).toContain('▲ GET /api');
      expect(barColor(row('GET /api'))).toBe('90');
      expect(plain(row('invoke'))).not.toContain('▲');
      // Other services take blue, green, purple in order of first appearance.
      expect(barColor(row('invoke'))).toBe('34');
      expect(barColor(row('db.query'))).toBe('32');
      expect(barColor(row('cache.get'))).toBe('35');
      // Status wins over the service color.
      expect(barColor(row('charge'))).toBe('31');
      expect(barColor(row('notify'))).toBe('32');

      const repeated = lines.find(l => plain(l).startsWith('  db.query  '));
      expect(barColor(repeated ?? '')).toBe('32');
    } finally {
      chalk.level = previousLevel;
    }
  });

  it('shows the incomplete-trace warning in the summary', () => {
    const trace: Trace = {
      traceId: 't',
      rootSpanId: 'root',
      spans: [span('root', undefined, 'root', 0, 100)],
    };
    expect(renderWaterfall(trace, { partial: true })).toContain(
      'Exceeded the span limit, so some spans are missing.'
    );
    expect(renderWaterfall(trace, {})).not.toContain('Exceeded');
  });

  it('truncates long names to fit narrow terminals', () => {
    const trace: Trace = {
      traceId: 't',
      rootSpanId: 'root',
      spans: [span('root', undefined, 'x'.repeat(200), 0, 100)],
    };
    const out = renderWaterfall(trace, { requestId: REQUEST_ID, columns: 64 });
    for (const line of out.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(60);
    }
    expect(out).toContain('…');
  });
});

describe('buildTreeLabels', () => {
  it('draws connectors that close finished branches', () => {
    const labels = buildTreeLabels([
      { name: 'root', depth: 0 },
      { name: 'a', depth: 1 },
      { name: 'a1', depth: 2 },
      { name: 'a2', depth: 2 },
      { name: 'b', depth: 1 },
      { name: 'b1', depth: 2 },
    ]);
    expect(labels).toEqual([
      'root',
      '├─ a',
      '│  ├─ a1',
      '│  └─ a2',
      '└─ b',
      '   └─ b1',
    ]);
  });
});

describe('renderSpanBar', () => {
  it('uses partial blocks for sub-cell precision', () => {
    expect(renderSpanBar(0, 50, 100, 10)).toBe('█████');
    expect(renderSpanBar(0, 55, 100, 10)).toBe('█████▌');
    expect(renderSpanBar(50, 25, 100, 10)).toBe('     ██▌');
  });

  it('keeps zero-length spans visible', () => {
    expect(renderSpanBar(30, 0, 100, 10)).toBe('   ▏');
  });

  it('clamps bars to the chart width', () => {
    expect(renderSpanBar(90, 50, 100, 10)).toBe('         █');
  });
});

describe('collapseRows', () => {
  it('collapses same-name siblings and merges their children', () => {
    const spans: Span[] = [span('root', undefined, 'root', 0, 100)];
    for (let i = 0; i < 3; i++) {
      spans.push(span(`f${i}`, 'root', 'fetch', i * 30, 20));
      spans.push(span(`d${i}`, `f${i}`, 'dns', i * 30, 2));
      spans.push(span(`t${i}`, `f${i}`, 'tls', i * 30 + 2, 5));
    }
    spans.push(span('render', 'root', 'render', 95, 5));
    const rows = collapseRows(analyze({ traceId: 't', spans }).treeOrder);
    expect(rows.map(r => [r.name, r.depth, r.spans.length])).toEqual([
      ['root', 0, 1],
      ['fetch', 1, 3],
      ['dns', 2, 3],
      ['tls', 2, 3],
      ['render', 1, 1],
    ]);
  });

  it('keeps the count visible when the name is truncated', () => {
    const spans: Span[] = [span('root', undefined, 'root', 0, 100)];
    for (let i = 0; i < 120; i++) {
      spans.push(span(`c${i}`, 'root', 'y'.repeat(100), i / 2, 0));
    }
    const out = renderWaterfall(
      { traceId: 't', rootSpanId: 'root', spans },
      { requestId: REQUEST_ID, columns: 84 }
    );
    expect(out).toMatch(/└─ y+… ×120 +0μs/);
    expect(out.split('\n').filter(l => l.includes('y…'))).toHaveLength(2);
  });
});

describe('renderCoverageBar', () => {
  it('draws every interval on one track with gaps between them', () => {
    const intervals = [
      { offsetUs: 0, durationUs: 20 },
      { offsetUs: 50, durationUs: 20 },
    ];
    expect(renderCoverageBar(intervals, 100, 10)).toBe('██   ██');
  });

  it('shows sparse short calls as thin ticks', () => {
    const intervals = [0, 30, 60].map(offsetUs => ({
      offsetUs,
      durationUs: 0,
    }));
    expect(renderCoverageBar(intervals, 100, 10)).toBe('▏  ▏  ▏');
  });
});
