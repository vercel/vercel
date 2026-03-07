import { parseCronExpression } from '@vercel/config/v1';

// Expand a single cron field into the full set of matching integer
// values within [min, max].  Handles *, ranges (1-5), steps (0-30/10),
// and comma-separated lists (1,15,30).
// We need this, because parseCronExpression from  @vercel/config
// doesn't expand fields by its own.
export function expandCronField(
  field: string,
  min: number,
  max: number
): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const range = stepMatch ? stepMatch[1] : part;
    const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;

    let start: number;
    let end: number;

    if (range === '*') {
      start = min;
      end = max;
    } else if (range.includes('-')) {
      const [lo, hi] = range.split('-').map(Number);
      start = lo;
      end = hi;
    } else {
      const val = parseInt(range, 10);
      start = val;
      end = val;
    }

    for (let i = start; i <= end; i += step) {
      values.add(i);
    }
  }

  return values;
}

function nextOrWrap(sorted: number[], current: number): number | null {
  for (const v of sorted) {
    if (v >= current) return v;
  }
  return null;
}

function dayMatches(
  date: Date,
  daysOfMonth: Set<number>,
  daysOfWeek: Set<number>,
  orDays: boolean
): boolean {
  if (orDays) {
    return daysOfMonth.has(date.getDate()) || daysOfWeek.has(date.getDay());
  }
  return daysOfMonth.has(date.getDate()) && daysOfWeek.has(date.getDay());
}

/**
 * Compute the delay in milliseconds until the next matching cron time.
 *
 * @param expression - Standard 5-field cron expression
 * @param now - Time to start searching from (defaults to `new Date()`)
 * @returns Delay in ms, or null if the expression cannot be parsed.
 */
export function getNextCronDelay(
  expression: string,
  now: Date = new Date()
): number | null {
  let parsed;
  try {
    parsed = parseCronExpression(expression);
  } catch {
    return null;
  }

  const minuteSet = expandCronField(parsed.minute, 0, 59);
  const hourSet = expandCronField(parsed.hour, 0, 23);
  const domSet = expandCronField(parsed.dayOfMonth, 1, 31);
  const monthSet = expandCronField(parsed.month, 1, 12);
  const dowSet = expandCronField(parsed.dayOfWeek, 0, 6);

  const sortedMinutes = [...minuteSet].sort((a, b) => a - b);
  const sortedHours = [...hourSet].sort((a, b) => a - b);
  const sortedMonths = [...monthSet].sort((a, b) => a - b);

  // Standard cron OR's day-of-month and day-of-week when both are
  // explicitly constrained (not "*").
  const orDays = parsed.dayOfMonth !== '*' && parsed.dayOfWeek !== '*';

  const t = new Date(now);
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);

  const maxYear = t.getFullYear() + 4;

  while (t.getFullYear() <= maxYear) {
    const month = t.getMonth() + 1;
    const nextMonth = nextOrWrap(sortedMonths, month);
    if (nextMonth === null || nextMonth > month) {
      const targetMonth = nextMonth ?? sortedMonths[0];
      if (nextMonth === null) {
        t.setFullYear(t.getFullYear() + 1);
      }
      t.setMonth(targetMonth - 1, 1);
      t.setHours(sortedHours[0], sortedMinutes[0]);
      continue;
    }

    if (!dayMatches(t, domSet, dowSet, orDays)) {
      t.setDate(t.getDate() + 1);
      t.setHours(sortedHours[0], sortedMinutes[0]);
      continue;
    }

    const hour = t.getHours();
    const nextHour = nextOrWrap(sortedHours, hour);
    if (nextHour === null || nextHour > hour) {
      if (nextHour === null) {
        t.setDate(t.getDate() + 1);
        t.setHours(sortedHours[0], sortedMinutes[0]);
      } else {
        t.setHours(nextHour, sortedMinutes[0]);
      }
      continue;
    }

    const minute = t.getMinutes();
    const nextMinute = nextOrWrap(sortedMinutes, minute);
    if (nextMinute === null || nextMinute > minute) {
      if (nextMinute === null) {
        t.setHours(t.getHours() + 1, sortedMinutes[0]);
      } else {
        t.setMinutes(nextMinute);
      }
      continue;
    }

    return t.getTime() - now.getTime();
  }

  return null;
}
