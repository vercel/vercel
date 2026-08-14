import ms from 'ms';

export function parseTimeFlag(input: string): Date {
  const milliseconds = ms(input);
  if (milliseconds !== undefined) {
    return new Date(Date.now() - milliseconds);
  }

  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(
      `Invalid time format "${input}". Use relative (1h, 30m, 2d, 1w) or ISO 8601 datetime.`
    );
  }

  return date;
}

export function resolveTimeRange(
  since: string = '1h',
  until?: string
): { startTime: Date; endTime: Date } {
  const startTime = parseTimeFlag(since);
  const endTime = until ? parseTimeFlag(until) : new Date();
  return { startTime, endTime };
}
