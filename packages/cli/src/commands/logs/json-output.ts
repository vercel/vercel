import stripAnsi from 'strip-ansi';
import { recordLine as sharedRecordLine } from '../../util/observability/jsonl';
import type { LogEvent } from './query';
import type { LogsTimeRange } from './time-range';

export {
  summaryLine,
  writeJsonError,
  type JsonErrorPayload,
  type Pagination,
  type ResultProgress,
} from '../../util/observability/jsonl';

/**
 * The `vercel logs --json` contract: JSON Lines on stdout, one object per
 * line, each with a CLI-owned `type`:
 *
 * - `log` / `request`: one record, with the unchanged API event under `data`.
 * - `warning`: a nonfatal condition (`deprecated`, `limit_clamped`,
 *   `stream_gap`).
 * - `summary`: the last line of every successful invocation.
 *
 * A failure writes one JSON error document on stderr instead of a summary.
 */

export type WarningReason = 'deprecated' | 'limit_clamped' | 'stream_gap';

export interface WarningLine {
  readonly type: 'warning';
  readonly reason: WarningReason;
  readonly message: string;
  readonly data?: Record<string, unknown>;
}

export function recordLine(type: 'log' | 'request', event: LogEvent): string {
  return sharedRecordLine(type, event);
}

export function warningLine(warning: Omit<WarningLine, 'type'>): string {
  const line: WarningLine = {
    type: 'warning',
    reason: warning.reason,
    message: stripAnsi(warning.message),
    ...(warning.data ? { data: warning.data } : {}),
  };
  return `${JSON.stringify(line)}\n`;
}

export function serializeTimeRange(range: LogsTimeRange): {
  start: string;
  end: string;
} {
  return { start: range.start.toISOString(), end: range.end.toISOString() };
}
