import ms from 'ms';
import { parseTimeFlag } from '../../util/time-utils';
import { DEFAULT_WINDOW } from './command';

export interface LogsTimeRange {
  readonly start: Date;
  readonly end: Date;
}

export type LogsTimeRangeResult =
  | { readonly range: LogsTimeRange }
  | { readonly error: string };

function parseBound(
  flag: '--since' | '--until',
  value: string,
  now: number
): Date | string {
  try {
    return parseTimeFlag(value, now);
  } catch {
    return `Invalid time format "${value}" for ${flag}. Use a relative duration (1h, 30m, 2d), an ISO 8601 datetime, or now.`;
  }
}

/**
 * Resolves the query window once, against the command start time, so every
 * page uses the same bounds. An omitted start is the default window before
 * the end: before command start, or before `--until` when it is given.
 */
export function resolveLogsTimeRange({
  since,
  until,
  now,
  wholeSeconds,
}: {
  since?: string;
  until?: string;
  now: number;
  wholeSeconds: boolean;
}): LogsTimeRangeResult {
  const end =
    until !== undefined ? parseBound('--until', until, now) : new Date(now);
  if (typeof end === 'string') return { error: end };
  const start =
    since !== undefined
      ? parseBound('--since', since, now)
      : new Date(end.getTime() - ms(DEFAULT_WINDOW));
  if (typeof start === 'string') return { error: start };

  const range = wholeSeconds
    ? { start: floorToSecond(start), end: floorToSecond(end) }
    : { start, end };

  if (range.start.getTime() >= range.end.getTime()) {
    return {
      error: [
        `The time range is empty: the start (${range.start.toISOString()}) must be before the end (${range.end.toISOString()}).`,
        'Use --since to set an earlier start.',
      ].join('\n'),
    };
  }

  return { range };
}

function floorToSecond(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}
