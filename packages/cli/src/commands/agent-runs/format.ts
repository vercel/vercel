import chalk from 'chalk';
import ms from 'ms';
import title from 'title';

// The Agent Runs API response shapes are owned by the dashboard; these helpers
// read the documented fields defensively and fall back to '-' so the human
// views degrade gracefully. `--json` is the stable machine contract.

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function readString(
  record: UnknownRecord | undefined,
  ...keys: string[]
): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

export function readNumber(
  record: UnknownRecord | undefined,
  ...keys: string[]
): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

export function readRecord(
  record: UnknownRecord | undefined,
  ...keys: string[]
): UnknownRecord | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return undefined;
}

/** Timestamps arrive as epoch milliseconds or ISO 8601 strings. */
export function readTimestampMs(
  record: UnknownRecord | undefined,
  ...keys: string[]
): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.length > 0) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

const PLACEHOLDER = '-';

export function runId(run: UnknownRecord): string {
  return readString(run, 'id', 'runId') ?? PLACEHOLDER;
}

export function runStatus(run: UnknownRecord): string {
  return readString(run, 'status', 'state') ?? PLACEHOLDER;
}

export function formatRunStatus(run: UnknownRecord): string {
  const status = readString(run, 'status', 'state');
  if (!status) return PLACEHOLDER;
  const label = title(status.replace(/[_-]+/g, ' '));
  const CIRCLE = '● ';
  switch (status.toLowerCase()) {
    case 'completed':
    case 'succeeded':
    case 'success':
    case 'ready':
      return chalk.green(CIRCLE) + label;
    case 'error':
    case 'errored':
    case 'failed':
    case 'timed out':
    case 'timed_out':
      return chalk.red(CIRCLE) + label;
    case 'running':
    case 'in progress':
    case 'in_progress':
    case 'pending':
    case 'queued':
    case 'started':
      return chalk.yellow(CIRCLE) + label;
    case 'canceled':
    case 'cancelled':
      return chalk.gray(label);
    default:
      return label;
  }
}

export function runModel(run: UnknownRecord): string {
  return readString(run, 'model') ?? PLACEHOLDER;
}

export function runTrigger(run: UnknownRecord): string {
  return (
    readString(run, 'trigger') ??
    readString(readRecord(run, 'trigger'), 'label', 'type', 'name') ??
    PLACEHOLDER
  );
}

export function runTitle(run: UnknownRecord): string | undefined {
  return readString(run, 'title', 'name');
}

export function runStartedAtMs(run: UnknownRecord): number | undefined {
  return readTimestampMs(run, 'createdAt', 'startedAt', 'startTime');
}

export function runDurationMs(run: UnknownRecord): number | undefined {
  const explicit = readNumber(run, 'durationMs', 'duration');
  if (explicit !== undefined) return explicit;
  const start = readTimestampMs(run, 'startedAt', 'createdAt', 'startTime');
  const end = readTimestampMs(run, 'endedAt', 'completedAt', 'endTime');
  if (start !== undefined && end !== undefined && end >= start) {
    return end - start;
  }
  return undefined;
}

export function runTotalTokens(run: UnknownRecord): number | undefined {
  const usage = readRecord(run, 'usage') ?? run;
  const total = readNumber(usage, 'totalTokens', 'total');
  if (total !== undefined) return total;
  const input = readNumber(usage, 'inputTokens', 'promptTokens', 'input');
  const output = readNumber(
    usage,
    'outputTokens',
    'completionTokens',
    'output'
  );
  if (input !== undefined || output !== undefined) {
    return (input ?? 0) + (output ?? 0);
  }
  return undefined;
}

export function formatAge(timestampMs: number | undefined): string {
  if (timestampMs === undefined) return PLACEHOLDER;
  const delta = Date.now() - timestampMs;
  if (delta < 1000) return 'just now';
  return `${ms(delta)} ago`;
}

export function formatTimestamp(timestampMs: number | undefined): string {
  if (timestampMs === undefined) return PLACEHOLDER;
  return new Date(timestampMs).toISOString();
}

export function formatDurationMs(value: number | undefined): string {
  if (value === undefined) return PLACEHOLDER;
  if (value < 1000) return `${Math.round(value)}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)}s`;
  return ms(Math.round(value));
}

export function formatCount(value: number | undefined): string {
  if (value === undefined) return PLACEHOLDER;
  if (value < 10_000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}
