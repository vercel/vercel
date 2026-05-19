// Mirror of `@vercel/trace-viewer/types`. Will be swapped for the published
// package once it ships to npm.

export type SpanStatus = {
  code: number;
  message?: string;
};

export type Span = {
  spanId: string;
  parentSpanId?: string;
  name: string;
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
