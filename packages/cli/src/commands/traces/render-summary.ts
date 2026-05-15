import type { Span, Trace } from './types';

const UNKNOWN = '<unknown>';

/**
 * Convert a `[seconds, nanoseconds]` duration tuple to milliseconds.
 */
function durationToMs(duration: Span['duration'] | undefined): number | null {
  if (!duration || duration.length !== 2) {
    return null;
  }
  const [seconds, nanoseconds] = duration;
  if (typeof seconds !== 'number' || typeof nanoseconds !== 'number') {
    return null;
  }
  return seconds * 1000 + nanoseconds / 1_000_000;
}

function formatMs(ms: number | null): string {
  if (ms === null) {
    return UNKNOWN;
  }
  // Show fractional ms below 1ms, whole ms above.
  if (ms < 1) {
    return `${ms.toFixed(3)}ms`;
  }
  return `${Math.round(ms)}ms`;
}

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

/**
 * Read an attribute as a string, accepting numbers (coerced via `String`).
 * Returns `undefined` for any other type so callers can render `UNKNOWN`.
 */
function readAttr(
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

function hasColdStart(spans: Span[]): boolean {
  return spans.some(span => span.attributes?.['func.cold'] === true);
}

function countErrors(spans: Span[]): number {
  return spans.reduce(
    (acc, span) => (span.status?.code === 1 ? acc + 1 : acc),
    0
  );
}

function formatMethodAndPath(
  method: string | undefined,
  path: string | undefined
): string {
  if (method && path) {
    return `${method} ${path}`;
  }
  return method ?? path ?? UNKNOWN;
}

/**
 * Format a `Trace` into the human-readable summary block printed by
 * `vercel traces get`. Pure function — no I/O.
 */
export function renderSummary(
  trace: Trace,
  options: { requestId: string }
): string {
  const root = resolveRootSpan(trace);
  const attributes = root?.attributes;

  const status = readAttr(attributes, 'http.status_code') ?? UNKNOWN;
  const methodAndPath = formatMethodAndPath(
    readAttr(attributes, 'http.method'),
    readAttr(attributes, 'http.target')
  );
  const duration = formatMs(durationToMs(root?.duration));
  const coldStart = hasColdStart(trace.spans) ? 'yes' : 'no';
  const errors = countErrors(trace.spans);

  const lines = [
    `Trace id:     ${trace.traceId}`,
    `Request id:   ${options.requestId}`,
    `Status:       ${status}`,
    `Method/path:  ${methodAndPath}`,
    `Duration:     ${duration}`,
    `Cold start:   ${coldStart}`,
    `Spans:        ${trace.spans.length}`,
    `Errors:       ${errors}`,
  ];

  return lines.join('\n');
}
