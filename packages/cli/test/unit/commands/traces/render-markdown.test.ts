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
          status: { code: 0 },
        },
        {
          spanId: 'span_mw',
          parentSpanId: 'span_root',
          name: 'middleware',
          startTime: [0, 10_000_000],
          duration: [0, 50_000_000],
          status: { code: 0 },
        },
        {
          spanId: 'span_fetch',
          parentSpanId: 'span_root',
          name: 'fetch upstream',
          startTime: [0, 80_000_000],
          duration: [0, 120_000_000],
          attributes: { 'http.url': 'https://api.example.com/users' },
          status: { code: 0 },
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

      ## Span tree

      - \`250.0ms\` 100% +0μs \`GET /api/hello\` — \`http.target\`: /api/hello
        - \`50.0ms\` 20% +10.0ms \`middleware\`
        - \`120.0ms\` 48% +80.0ms \`fetch upstream\` — \`http.url\`: https://api.example.com/users
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
          status: { code: 0 },
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
          status: { code: 1, message: '503 Service Unavailable' },
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

      ## Span tree

      - \`500.0ms\` 100% +0μs \`POST /api/checkout\` — \`http.target\`: /api/checkout
        - \`400.0ms\` 80% +50.0ms \`fetch upstream\` [error: 503 Service Unavailable] — \`http.url\`: https://api.example.com/charge
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
      - **Duration:** 1.0s
      - **Spans:** 4

      ## Repeated operations

      | Operation | Count | Total | Per call | % of root |
      | --- | ---: | ---: | ---: | ---: |
      | \`db.query users\` | 3 | 180.0ms | 60.0ms | 18% |

      ## Span tree

      - \`1.0s\` 100% +0μs \`GET /api/users\` — \`http.target\`: /api/users
        - \`50.0ms\` 5% +100.0ms \`db.query users\`
        - \`60.0ms\` 6% +200.0ms \`db.query users\`
        - \`70.0ms\` 7% +300.0ms \`db.query users\`
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
});
