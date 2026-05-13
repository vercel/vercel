// Cron expression utilities for the Vercel CLI.
//
// Supports the strict subset of POSIX cron syntax that Vercel accepts: 5
// numeric fields with `*`, `*/n`, `a-b`, `a-b/n`, and `a,b,c`. Day-of-week
// accepts `0`-`7` (both `0` and `7` mean Sunday). Names like `MON`, `JAN` and
// predefined aliases like `@daily`, `@yearly` are not supported.
//
// Time math runs in the local timezone, matching how `vercel dev`'s cron
// simulator presents fire times against a developer's wall clock.

export interface CronFields {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

const MAX_LENGTH = 256;
const MAX_YEAR_OFFSET = 5;

const CRON_FIELD_RANGES: [string, number, number][] = [
  ['minute', 0, 59],
  ['hour', 0, 23],
  ['day of month', 1, 31],
  ['month', 1, 12],
  ['day of week', 0, 7],
];

/**
 * Validate a cron expression. Returns `true` on success, or a human-readable
 * error string on failure.
 */
export function validateCronSchedule(expression: string): string | true {
  if (expression.length > MAX_LENGTH) {
    return `Schedule expression must be ${MAX_LENGTH} characters or less`;
  }

  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    return `Schedule must have exactly 5 fields (minute hour day-of-month month day-of-week), got ${fields.length}`;
  }

  for (let i = 0; i < fields.length; i++) {
    const [name, min, max] = CRON_FIELD_RANGES[i];
    const error = validateCronField(fields[i], name, min, max);
    if (error) {
      return error;
    }
  }

  return true;
}

function validateCronField(
  field: string,
  name: string,
  min: number,
  max: number
): string | null {
  // Handle lists (e.g. "1,15,30")
  const parts = field.split(',');
  for (const part of parts) {
    // Handle step values (e.g. "*/5" or "1-30/2")
    const [range, stepStr] = part.split('/');

    if (stepStr !== undefined) {
      const step = Number(stepStr);
      if (!Number.isInteger(step) || step < 1) {
        return `Invalid step value "${stepStr}" in ${name} field`;
      }
    }

    if (range === '*') {
      continue;
    }

    // Handle ranges (e.g. "1-5")
    if (range.includes('-')) {
      const rangeParts = range.split('-');
      if (
        rangeParts.length !== 2 ||
        rangeParts[0] === '' ||
        rangeParts[1] === ''
      ) {
        return `Invalid range "${range}" in ${name} field`;
      }
      const [startStr, endStr] = rangeParts;
      const start = Number(startStr);
      const end = Number(endStr);
      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        return `Invalid range "${range}" in ${name} field`;
      }
      if (start < min || start > max || end < min || end > max) {
        return `Value out of range in ${name} field (${min}-${max})`;
      }
      if (start > end) {
        return `Invalid range "${range}" in ${name} field: start is greater than end`;
      }
      continue;
    }

    // Single value
    const value = Number(range);
    if (!Number.isInteger(value)) {
      return `Invalid value "${range}" in ${name} field`;
    }
    if (value < min || value > max) {
      return `Value ${value} out of range in ${name} field (${min}-${max})`;
    }
  }

  return null;
}

/**
 * Split a 5-field cron expression into its raw string fields. Returns `null`
 * if the input doesn't have exactly 5 fields. Note: this is a *syntactic*
 * split — for full validation use `validateCronSchedule`.
 */
export function parseCronFields(expression: string): CronFields | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  return { minute, hour, dayOfMonth, month, dayOfWeek };
}

/**
 * Expand a single cron field into the full set of matching integer values
 * within `[min, max]`. Handles `*`, ranges (`1-5`), steps (`0-30/10`), and
 * comma-separated parts (`1,15,30`). Caller is responsible for validation;
 * an unvalidated invalid field may produce nonsensical output.
 */
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
 * @param expression - 5-field cron expression (validated against
 *   `validateCronSchedule`)
 * @param now - Time to start searching from (defaults to `new Date()`)
 * @returns Delay in ms, or `null` if the expression is invalid or no
 *   occurrence falls within the next ${MAX_YEAR_OFFSET} years.
 */
export function getNextCronDelay(
  expression: string,
  now: Date = new Date()
): number | null {
  if (validateCronSchedule(expression) !== true) return null;
  // validateCronSchedule guarantees parseCronFields will succeed.
  const parsed = parseCronFields(expression);
  if (!parsed) return null;

  const minuteSet = expandCronField(parsed.minute, 0, 59);
  const hourSet = expandCronField(parsed.hour, 0, 23);
  const domSet = expandCronField(parsed.dayOfMonth, 1, 31);
  const monthSet = expandCronField(parsed.month, 1, 12);
  const dowSet = expandCronField(parsed.dayOfWeek, 0, 7);

  // Cron treats both 0 and 7 as Sunday — collapse onto 0 so the comparison
  // against `Date.getDay()` (which returns 0-6) works correctly.
  if (dowSet.has(7)) {
    dowSet.delete(7);
    dowSet.add(0);
  }

  const sortedMinutes = [...minuteSet].sort((a, b) => a - b);
  const sortedHours = [...hourSet].sort((a, b) => a - b);
  const sortedMonths = [...monthSet].sort((a, b) => a - b);

  // Standard cron OR's day-of-month and day-of-week when both are
  // explicitly constrained (not "*").
  const orDays = parsed.dayOfMonth !== '*' && parsed.dayOfWeek !== '*';

  const t = new Date(now);
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);

  const maxYear = t.getFullYear() + MAX_YEAR_OFFSET;

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
