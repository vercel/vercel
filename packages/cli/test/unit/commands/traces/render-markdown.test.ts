import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../../../../src/commands/traces/render-markdown';
import type { Trace } from '../../../../src/commands/traces/types';

const REQUEST_ID = 'req_abc123';

describe('renderMarkdown', () => {
  it('renders a happy-path trace with nested spans', () => {
    const trace: Trace = {
      traceId: 'trace_abcdef0123456789',
      rootSpanId: 'span_root',
      spans: [
        {
          spanId: 'span_root',
          name: 'GET /api/hello',
          startTime: [0, 0],
          duration: [0, 250_000_000], // 250ms
          attributes: {
            'http.method': 'GET',
            'http.target': '/api/hello',
            'http.status_code': 200,
          },
          status: { code: 'Unset' },
        },
        {
          spanId: 'span_mw',
          parentSpanId: 'span_root',
          name: 'middleware',
          startTime: [0, 10_000_000],
          duration: [0, 50_000_000],
          status: { code: 'Ok' },
        },
        {
          spanId: 'span_fetch',
          parentSpanId: 'span_root',
          name: 'fetch upstream',
          startTime: [0, 80_000_000],
          duration: [0, 120_000_000],
          attributes: { 'http.url': 'https://api.example.com/users' },
          status: { code: 'Unset' },
        },
      ],
    };
    expect(
      renderMarkdown(trace, { requestId: REQUEST_ID })
    ).toMatchInlineSnapshot(`
      "# Trace trace_abcdef…

      - **Trace id:** trace_abcdef0123456789
      - **Request id:** req_abc123
      - **Endpoint:** \`GET /api/hello\` → 200
      - **Duration:** 250.0ms
      - **Spans:** 3

      ## Slowest by self time

      | Span | Self time | Duration | % of trace |
      | --- | ---: | ---: | ---: |
      | \`fetch upstream\` | 120.0ms | 120.0ms | 48% |
      | \`GET /api/hello\` | 80.0ms | 250.0ms | 32% |
      | \`middleware\` | 50.0ms | 50.0ms | 20% |

      ## Span tree

      Each row: start offset | duration | self time | % of trace | name | status. Rows marked ×N group N sibling spans with the same name and show their totals.

      - +0ms | 250.0ms | 80.0ms | 100% | \`GET /api/hello\` | unset — \`http.target\`: /api/hello
        - +10.0ms | 50.0ms | 50.0ms | 20% | \`middleware\` | ok
        - +80.0ms | 120.0ms | 120.0ms | 48% | \`fetch upstream\` | unset — \`http.url\`: https://api.example.com/users
      "
    `);
  });

  it('renders an errored trace with the Errors section', () => {
    const trace: Trace = {
      traceId: 'trace_err',
      rootSpanId: 'r',
      spans: [
        {
          spanId: 'r',
          name: 'POST /api/checkout',
          startTime: [0, 0],
          duration: [0, 500_000_000],
          attributes: {
            'http.method': 'POST',
            'http.target': '/api/checkout',
            'http.status_code': 500,
          },
          status: { code: 'Unset' },
        },
        {
          spanId: 'fetch',
          parentSpanId: 'r',
          name: 'fetch upstream',
          startTime: [0, 50_000_000],
          duration: [0, 400_000_000],
          attributes: {
            'http.url': 'https://api.example.com/charge',
            'http.status_code': 503,
          },
          status: { code: 'Error', message: '503 Service Unavailable' },
        },
      ],
    };
    expect(
      renderMarkdown(trace, { requestId: REQUEST_ID })
    ).toMatchInlineSnapshot(`
      "# Trace trace_err

      - **Trace id:** trace_err
      - **Request id:** req_abc123
      - **Endpoint:** \`POST /api/checkout\` → 500
      - **Duration:** 500.0ms
      - **Spans:** 2 (1 error)

      ## Errors (1)

      - \`fetch upstream\` — \`503 Service Unavailable\`
        - \`http.url\`: https://api.example.com/charge
        - \`http.status_code\`: 503

      ## Slowest by self time

      | Span | Self time | Duration | % of trace |
      | --- | ---: | ---: | ---: |
      | \`fetch upstream\` | 400.0ms | 400.0ms | 80% |
      | \`POST /api/checkout\` | 100.0ms | 500.0ms | 20% |

      ## Span tree

      Each row: start offset | duration | self time | % of trace | name | status. Rows marked ×N group N sibling spans with the same name and show their totals.

      - +0ms | 500.0ms | 100.0ms | 100% | \`POST /api/checkout\` | unset — \`http.target\`: /api/checkout
        - +50.0ms | 400.0ms | 400.0ms | 80% | \`fetch upstream\` | error: 503 Service Unavailable — \`http.url\`: https://api.example.com/charge
      "
    `);
  });

  it('renders a Repeated operations section when names repeat', () => {
    const trace: Trace = {
      traceId: 'trace_repeat',
      rootSpanId: 'r',
      spans: [
        {
          spanId: 'r',
          name: 'GET /api/users',
          startTime: [0, 0],
          duration: [0, 1_000_000_000], // 1s
          attributes: {
            'http.method': 'GET',
            'http.target': '/api/users',
            'http.status_code': 200,
          },
        },
        {
          spanId: 'q1',
          parentSpanId: 'r',
          name: 'db.query users',
          startTime: [0, 100_000_000],
          duration: [0, 50_000_000],
        },
        {
          spanId: 'q2',
          parentSpanId: 'r',
          name: 'db.query users',
          startTime: [0, 200_000_000],
          duration: [0, 60_000_000],
        },
        {
          spanId: 'q3',
          parentSpanId: 'r',
          name: 'db.query users',
          startTime: [0, 300_000_000],
          duration: [0, 70_000_000],
        },
      ],
    };
    expect(
      renderMarkdown(trace, { requestId: REQUEST_ID })
    ).toMatchInlineSnapshot(`
      "# Trace trace_repeat

      - **Trace id:** trace_repeat
      - **Request id:** req_abc123
      - **Endpoint:** \`GET /api/users\` → 200
      - **Duration:** 1000ms
      - **Spans:** 4

      ## Slowest by self time

      | Span | Self time | Duration | % of trace |
      | --- | ---: | ---: | ---: |
      | \`GET /api/users\` | 820.0ms | 1000ms | 82% |
      | \`db.query users\` | 70.0ms | 70.0ms | 7% |
      | \`db.query users\` | 60.0ms | 60.0ms | 6% |
      | \`db.query users\` | 50.0ms | 50.0ms | 5% |

      ## Repeated operations

      | Operation | Count | Total | Per call | % of root |
      | --- | ---: | ---: | ---: | ---: |
      | \`db.query users\` | 3 | 180.0ms | 60.0ms | 18% |

      ## Span tree

      Each row: start offset | duration | self time | % of trace | name | status. Rows marked ×N group N sibling spans with the same name and show their totals.

      - +0ms | 1000ms | 820.0ms | 100% | \`GET /api/users\` | unset — \`http.target\`: /api/users
        - +100.0ms | 180.0ms | 180.0ms | 18% | \`db.query users\` ×3 | unset
      "
    `);
  });

  it('renders an empty trace with a placeholder', () => {
    const trace: Trace = { traceId: 'trace_empty', spans: [] };
    expect(
      renderMarkdown(trace, { requestId: REQUEST_ID })
    ).toMatchInlineSnapshot(`
      "# Trace trace_empty

      - **Trace id:** trace_empty
      - **Request id:** req_abc123
      - **Endpoint:** <unknown>
      - **Duration:** <unknown>
      - **Spans:** 0

      ## Span tree

      _No spans._
      "
    `);
  });

  it('caps the tree, keeping errors and slow branches, and says what was cut', () => {
    const spans: Trace['spans'] = [
      {
        spanId: 'root',
        name: 'GET /',
        startTime: [0, 0],
        duration: [1, 0],
        status: { code: 'Unset' },
      },
    ];
    for (let i = 0; i < 150; i++) {
      spans.push({
        spanId: `s${i}`,
        parentSpanId: 'root',
        name: `step ${i}`,
        startTime: [0, i * 1_000_000],
        duration: [0, (i + 1) * 1_000],
        status: { code: 'Unset' },
      });
    }
    // The shortest span, but an error, so it must survive the cap.
    spans.push({
      spanId: 'fail',
      parentSpanId: 'root',
      name: 'charge card',
      startTime: [0, 0],
      duration: [0, 1],
      status: { code: 'Error', message: 'declined' },
    });

    const out = renderMarkdown({ traceId: 't', rootSpanId: 'root', spans }, {});
    const tree = out.slice(out.indexOf('## Span tree'));
    const rows = tree.split('\n').filter(line => /^\s*- /.test(line));
    expect(rows).toHaveLength(96);
    expect(tree).toContain('`charge card` | error: declined');
    expect(tree).toContain('`step 149`');
    expect(tree).not.toContain('`step 0`');
    expect(tree).toContain(
      '_56 spans omitted to keep the tree short. Errors and the slowest branches are kept. Run with --json for every span._'
    );
  });

  it('warns in the output when the trace is incomplete', () => {
    const trace: Trace = { traceId: 't', spans: [] };
    expect(renderMarkdown(trace, { partial: true })).toContain(
      '> **Warning:** This trace is incomplete. It exceeded the span limit, so some spans are missing.'
    );
    expect(renderMarkdown(trace, {})).not.toContain('Warning');
  });
});
