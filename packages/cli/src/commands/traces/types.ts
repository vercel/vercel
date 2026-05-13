/**
 * Local copies of the trace types from `@vercel/trace-viewer/types`.
 *
 * The `@vercel/trace-viewer` package owns the canonical shape; this slice ships
 * before it is published to npm, so the types are duplicated here and will be
 * swapped for `import type { Trace } from '@vercel/trace-viewer/types';` once
 * the package is available.
 *
 * Keep these shapes in sync with the trace-viewer package.
 */

export type SpanStatus = {
  /**
   * `0` = unset / OK, `1` = error. Matches OpenTelemetry status codes.
   */
  code: number;
  message?: string;
};

export type Span = {
  spanId: string;
  parentSpanId?: string;
  name: string;
  /**
   * `[seconds, nanoseconds]` tuple expressing the span duration.
   */
  duration: [number, number];
  startTime?: [number, number];
  attributes?: Record<string, unknown>;
  status?: SpanStatus;
};

export type Trace = {
  traceId: string;
  rootSpanId?: string;
  spans: Span[];
};
