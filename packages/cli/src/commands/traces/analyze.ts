import type { Span, Trace } from './types';

export const MAX_TREE_DEPTH = 256;
export const ATTR_VALUE_MAX_LEN = 80;

/**
 * Attribute keys promoted into row-level hints, in priority order. The first
 * matching key wins when only one hint is shown (tree rows); errors include
 * every matching key.
 */
export const ATTR_HINT_KEYS = [
  'http.url',
  'http.target',
  'db.statement',
  'http.status_code',
] as const;

type DurationTuple = readonly [number, number];

function tupleToUs(tuple: DurationTuple | undefined): number | null {
  if (!tuple || tuple.length !== 2) {
    return null;
  }
  const [seconds, nanoseconds] = tuple;
  if (typeof seconds !== 'number' || typeof nanoseconds !== 'number') {
    return null;
  }
  return seconds * 1_000_000 + nanoseconds / 1_000;
}

export function getDurationUs(span: Span): number | null {
  const us = tupleToUs(span.duration);
  if (us === null) {
    return null;
  }
  return us < 0 ? 0 : us;
}

export function getStartTimeUs(span: Span): number | null {
  return tupleToUs(span.startTime);
}

export function readAttrString(
  attributes: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  const value = attributes?.[key];
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return undefined;
}

export function truncateAttrValue(value: string): string {
  if (value.length <= ATTR_VALUE_MAX_LEN) {
    return value;
  }
  return `${value.slice(0, ATTR_VALUE_MAX_LEN - 1)}…`;
}

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
  errorCount: number;
  repeatedOps: RepeatedOp[];
  hasColdStart: boolean;
  truncatedAtDepth: boolean;
};

/**
 * Resolve the root span using `trace.rootSpanId`, falling back to the first
 * span when the id is missing or doesn't match any span.
 */
export function resolveRootSpan(trace: Trace): Span | undefined {
  if (trace.spans.length === 0) {
    return undefined;
  }
  if (trace.rootSpanId) {
    const match = trace.spans.find(span => span.spanId === trace.rootSpanId);
    if (match) {
      return match;
    }
  }
  return trace.spans[0];
}

function compareByStart(a: Span, b: Span): number {
  const startA = getStartTimeUs(a);
  const startB = getStartTimeUs(b);
  if (startA === null && startB === null) {
    return 0;
  }
  if (startA === null) {
    return 1;
  }
  if (startB === null) {
    return -1;
  }
  return startA - startB;
}

export function analyze(trace: Trace): AnalyzedTrace {
  const root = resolveRootSpan(trace);
  const rootDurationUs = root ? getDurationUs(root) : null;
  const rootStartUs = root ? getStartTimeUs(root) : null;

  const spansById = new Map<string, Span>();
  for (const span of trace.spans) {
    spansById.set(span.spanId, span);
  }

  const childrenByParent = new Map<string, Span[]>();
  for (const span of trace.spans) {
    if (!span.parentSpanId) {
      continue;
    }
    if (!spansById.has(span.parentSpanId)) {
      continue;
    }
    const list = childrenByParent.get(span.parentSpanId);
    if (list) {
      list.push(span);
    } else {
      childrenByParent.set(span.parentSpanId, [span]);
    }
  }
  for (const list of childrenByParent.values()) {
    list.sort(compareByStart);
  }

  const spanInfo = new Map<string, AnalyzedSpan>();
  for (const span of trace.spans) {
    const durationUs = getDurationUs(span);
    const children = childrenByParent.get(span.spanId) ?? [];
    let childTotalUs = 0;
    for (const child of children) {
      const cd = getDurationUs(child);
      if (cd !== null) {
        childTotalUs += cd;
      }
    }
    const selfTimeUs =
      durationUs === null ? null : Math.max(0, durationUs - childTotalUs);
    let startOffsetUs: number | null = null;
    if (rootStartUs !== null) {
      const startUs = getStartTimeUs(span);
      if (startUs !== null) {
        startOffsetUs = Math.max(0, startUs - rootStartUs);
      }
    }
    spanInfo.set(span.spanId, {
      span,
      durationUs,
      selfTimeUs,
      startOffsetUs,
    });
  }

  const visited = new Set<string>();
  const treeOrder: TreeNode[] = [];
  let truncatedAtDepth = false;
  if (root) {
    truncatedAtDepth =
      walkTree(root, 0, childrenByParent, visited, treeOrder) ||
      truncatedAtDepth;
  }

  // Spans not reached from the main root: either roots-of-other-trees (parent
  // missing from set or parentless and not the chosen root) or cycle members.
  // Walk each unvisited span as an orphan root, building further subtrees.
  const orphanOrder: TreeNode[] = [];
  const orphanRoots = trace.spans
    .filter(span => !visited.has(span.spanId))
    .filter(span => !span.parentSpanId || !spansById.has(span.parentSpanId))
    .sort(compareByStart);
  for (const orphan of orphanRoots) {
    truncatedAtDepth =
      walkTree(orphan, 0, childrenByParent, visited, orphanOrder) ||
      truncatedAtDepth;
  }
  // Anything still unvisited must be in a cycle; surface as a flat orphan row.
  for (const span of trace.spans) {
    if (!visited.has(span.spanId)) {
      orphanOrder.push({ span, depth: 0 });
      visited.add(span.spanId);
    }
  }

  const errorSpans = trace.spans.filter(span => span.status?.code === 1);
  const errorCount = errorSpans.length;
  const hasColdStart = trace.spans.some(
    span => span.attributes?.['func.cold'] === true
  );

  const byName = new Map<string, { count: number; totalUs: number }>();
  for (const span of trace.spans) {
    const name = span.name || '<unnamed>';
    const durationUs = getDurationUs(span) ?? 0;
    const entry = byName.get(name);
    if (entry) {
      entry.count += 1;
      entry.totalUs += durationUs;
    } else {
      byName.set(name, { count: 1, totalUs: durationUs });
    }
  }
  const repeatedOps: RepeatedOp[] = [];
  for (const [name, { count, totalUs }] of byName) {
    if (count >= 2) {
      repeatedOps.push({
        name,
        count,
        totalUs,
        perCallUs: totalUs / count,
      });
    }
  }
  repeatedOps.sort((a, b) => b.totalUs - a.totalUs);

  return {
    trace,
    root,
    rootDurationUs,
    rootStartUs,
    spanInfo,
    treeOrder,
    orphanOrder,
    errorSpans,
    errorCount,
    repeatedOps,
    hasColdStart,
    truncatedAtDepth,
  };
}

function walkTree(
  span: Span,
  depth: number,
  childrenByParent: Map<string, Span[]>,
  visited: Set<string>,
  out: TreeNode[]
): boolean {
  if (visited.has(span.spanId)) {
    return false;
  }
  visited.add(span.spanId);
  if (depth >= MAX_TREE_DEPTH) {
    out.push({ span, depth });
    return true;
  }
  out.push({ span, depth });
  let truncated = false;
  const children = childrenByParent.get(span.spanId) ?? [];
  for (const child of children) {
    truncated =
      walkTree(child, depth + 1, childrenByParent, visited, out) || truncated;
  }
  return truncated;
}
