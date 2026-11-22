import ms from 'ms';

/**
 * Parses a time flag value: `now`, a relative duration such as `1h` (that long
 * before `now`), or an ISO 8601 datetime.
 *
 * Pass `now` to resolve several values against one reference instant.
 */
export function parseTimeFlag(input: string, now: number = Date.now()): Date {
  if (input.trim() === 'now') {
    return new Date(now);
  }

  const milliseconds = ms(input);
  if (milliseconds !== undefined) {
    return new Date(now - milliseconds);
  }

  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(
      `Invalid time format "${input}". Use relative (1h, 30m, 2d, 1w), ISO 8601 datetime, or now.`
    );
  }

  return date;
}

export function resolveTimeRange(
  since: string = '1h',
  until?: string,
  now: number = Date.now()
): { startTime: Date; endTime: Date } {
  const startTime = parseTimeFlag(since, now);
  const endTime = until ? parseTimeFlag(until, now) : new Date(now);
  return { startTime, endTime };
}
