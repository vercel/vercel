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

export type AnalyzedSpan = {
  span: Span;
  durationUs: number | null;
  selfTimeUs: number | null;
  startOffsetUs: number | null;
};

export type RepeatedOp = {
  name: string;
  count: number;
  totalUs: number;
  perCallUs: number;
};

export type TreeNode = {
  span: Span;
  depth: number;
};

export type AnalyzedTrace = {
  trace: Trace;
  root: Span | undefined;
  rootDurationUs: number | null;
  rootStartUs: number | null;
  spanInfo: Map<string, AnalyzedSpan>;
  treeOrder: TreeNode[];
  orphanOrder: TreeNode[];
  errorSpans: Span[];
  repeatedOps: RepeatedOp[];
  truncatedAtDepth: boolean;
};
