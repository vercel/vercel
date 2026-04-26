// Compute the next and previous fire times for a cron expression in UTC.
//
// Supports the strict subset of POSIX cron syntax that Vercel accepts (see
// `validateCronSchedule` in src/commands/crons/add.ts):
//
//     field   range    syntax       e.g.
//     ──────  ──────── ───────────  ──────────────────
//     minute  0-59     * /n - ,     `0`, `*/5`, `0,30`
//     hour    0-23     * /n - ,     `0`, `*/2`, `0-5`
//     dom     1-31     * /n - ,     `1`, `1,15`, `1-15`
//     month   1-12     * /n - ,     `1`, `1,6`
//     dow     0-7      * /n - ,     `0`-`6`, `7` (Sunday)
//
// Day-of-month and day-of-week interact via the standard cron OR rule: when
// both fields are restricted (neither is `*`), a day matches if it satisfies
// either field. When only one is restricted, only that field is consulted.
//
// Names like `MON` and predefined expressions like `@daily` are NOT supported,
// matching `validateCronSchedule`.

interface ExpandedFields {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domStar: boolean;
  dowStar: boolean;
}

const MAX_LENGTH = 256;
const MAX_YEAR_OFFSET = 5;

export function parseCronExpression(expression: string): ExpandedFields | null {
  if (expression.length > MAX_LENGTH) return null;
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minF, hourF, domF, monthF, dowF] = fields;
  const minute = parseField(minF, 0, 59);
  const hour = parseField(hourF, 0, 23);
  const dom = parseField(domF, 1, 31);
  const month = parseField(monthF, 1, 12);
  const dow = parseField(dowF, 0, 7);
  if (!minute || !hour || !dom || !month || !dow) return null;
  // Cron treats both 0 and 7 as Sunday — collapse onto 0.
  if (dow.has(7)) {
    dow.delete(7);
    dow.add(0);
  }
  return {
    minute,
    hour,
    dom,
    month,
    dow,
    domStar: domF === '*',
    dowStar: dowF === '*',
  };
}

function parseField(
  field: string,
  min: number,
  max: number
): Set<number> | null {
  const result = new Set<number>();
  for (const part of field.split(',')) {
    if (part === '') return null;
    const [rangePart, stepPart, ...rest] = part.split('/');
    if (rest.length > 0) return null;
    let step = 1;
    if (stepPart !== undefined) {
      if (stepPart === '') return null;
      const s = Number(stepPart);
      if (!Number.isInteger(s) || s < 1) return null;
      step = s;
    }
    let start: number;
    let end: number;
    if (rangePart === '*') {
      start = min;
      end = max;
    } else if (rangePart.includes('-')) {
      const parts = rangePart.split('-');
      if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
        return null;
      }
      const a = Number(parts[0]);
      const b = Number(parts[1]);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a > b) return null;
      start = a;
      end = b;
    } else {
      if (rangePart === '') return null;
      const v = Number(rangePart);
      if (!Number.isInteger(v)) return null;
      // `5/3` (single value with step) means: start at 5, step by 3 up to max.
      start = v;
      end = stepPart !== undefined ? max : v;
    }
    if (start < min || start > max || end < min || end > max) return null;
    for (let i = start; i <= end; i += step) {
      result.add(i);
    }
  }
  return result;
}

function dayMatches(
  year: number,
  month0: number,
  day: number,
  fields: ExpandedFields
): boolean {
  const dowJs = new Date(Date.UTC(year, month0, day)).getUTCDay();
  if (fields.domStar && fields.dowStar) return true;
  if (fields.domStar) return fields.dow.has(dowJs);
  if (fields.dowStar) return fields.dom.has(day);
  return fields.dom.has(day) || fields.dow.has(dowJs);
}

// Find the next minute strictly after `start` that satisfies `fields`, or
// `null` if no occurrence falls within the next `MAX_YEAR_OFFSET` years
// (e.g. unschedulable expressions like `0 0 30 2 *`).
export function nextFireAfter(
  start: Date,
  fields: ExpandedFields
): Date | null {
  let cur = new Date(Math.floor(start.getTime() / 60000 + 1) * 60000);
  const sortedMonths = [...fields.month].sort((a, b) => a - b);
  const sortedHours = [...fields.hour].sort((a, b) => a - b);
  const sortedMinutes = [...fields.minute].sort((a, b) => a - b);
  const stopYear = cur.getUTCFullYear() + MAX_YEAR_OFFSET;

  while (cur.getUTCFullYear() <= stopYear) {
    const year = cur.getUTCFullYear();
    const month0 = cur.getUTCMonth();
    const day = cur.getUTCDate();
    const hour = cur.getUTCHours();
    const minute = cur.getUTCMinutes();

    if (!fields.month.has(month0 + 1)) {
      const nextMonth = sortedMonths.find(m => m > month0 + 1);
      cur =
        nextMonth !== undefined
          ? new Date(Date.UTC(year, nextMonth - 1, 1))
          : new Date(Date.UTC(year + 1, sortedMonths[0] - 1, 1));
      continue;
    }
    if (!dayMatches(year, month0, day, fields)) {
      cur = new Date(Date.UTC(year, month0, day + 1));
      continue;
    }
    if (!fields.hour.has(hour)) {
      const nextHour = sortedHours.find(h => h > hour);
      cur =
        nextHour !== undefined
          ? new Date(Date.UTC(year, month0, day, nextHour))
          : new Date(Date.UTC(year, month0, day + 1));
      continue;
    }
    if (!fields.minute.has(minute)) {
      const nextMin = sortedMinutes.find(m => m > minute);
      cur =
        nextMin !== undefined
          ? new Date(Date.UTC(year, month0, day, hour, nextMin))
          : new Date(Date.UTC(year, month0, day, hour + 1));
      continue;
    }
    return cur;
  }
  return null;
}

// Find the most recent minute strictly before `start` that satisfies `fields`,
// or `null` if no occurrence falls within the previous `MAX_YEAR_OFFSET` years.
export function previousFireBefore(
  start: Date,
  fields: ExpandedFields
): Date | null {
  let cur = new Date(Math.floor(start.getTime() / 60000) * 60000 - 60000);
  const sortedMonths = [...fields.month].sort((a, b) => b - a);
  const sortedHours = [...fields.hour].sort((a, b) => b - a);
  const sortedMinutes = [...fields.minute].sort((a, b) => b - a);
  const stopYear = cur.getUTCFullYear() - MAX_YEAR_OFFSET;

  while (cur.getUTCFullYear() >= stopYear) {
    const year = cur.getUTCFullYear();
    const month0 = cur.getUTCMonth();
    const day = cur.getUTCDate();
    const hour = cur.getUTCHours();
    const minute = cur.getUTCMinutes();

    if (!fields.month.has(month0 + 1)) {
      const prevMonth = sortedMonths.find(m => m < month0 + 1);
      // `Date.UTC(y, m, 0)` is "day 0" of month m, which JS interprets as the
      // last day of month m-1. Used here to land on the last day of the
      // previous valid month.
      cur =
        prevMonth !== undefined
          ? new Date(Date.UTC(year, prevMonth, 0, 23, 59))
          : new Date(Date.UTC(year - 1, sortedMonths[0], 0, 23, 59));
      continue;
    }
    if (!dayMatches(year, month0, day, fields)) {
      cur = new Date(Date.UTC(year, month0, day - 1, 23, 59));
      continue;
    }
    if (!fields.hour.has(hour)) {
      const prevHour = sortedHours.find(h => h < hour);
      cur =
        prevHour !== undefined
          ? new Date(Date.UTC(year, month0, day, prevHour, 59))
          : new Date(Date.UTC(year, month0, day - 1, 23, 59));
      continue;
    }
    if (!fields.minute.has(minute)) {
      const prevMin = sortedMinutes.find(m => m < minute);
      cur =
        prevMin !== undefined
          ? new Date(Date.UTC(year, month0, day, hour, prevMin))
          : new Date(Date.UTC(year, month0, day, hour - 1, 59));
      continue;
    }
    return cur;
  }
  return null;
}
