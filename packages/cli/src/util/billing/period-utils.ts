import { DateTime } from 'luxon';
import ms from 'ms';
import type { BreakdownPeriod } from '../../commands/usage/types';

// Vercel billing periods are aligned to LA (Pacific) time
export const LA_TIMEZONE = 'America/Los_Angeles';

function toISOOrThrow(dt: DateTime): string {
  if (!dt.isValid) {
    throw new Error(`Invalid DateTime: ${dt.invalidReason}`);
  }
  const iso = dt.toISO();
  if (!iso) {
    throw new Error(`Failed to convert DateTime to ISO`);
  }
  return iso;
}

function getDefaultFromDateTime(): DateTime {
  return DateTime.now().setZone(LA_TIMEZONE).startOf('month');
}

function getDefaultToDateTime(): DateTime {
  return DateTime.utc();
}

export function getDefaultFromDate(): string {
  const dt = getDefaultFromDateTime();
  return toISOOrThrow(dt.toUTC());
}

export function getDefaultToDate(): string {
  const dt = getDefaultToDateTime();
  return toISOOrThrow(dt.toUTC());
}

export function getDefaultFromDateDisplay(): string {
  const dt = getDefaultFromDateTime();
  return dt.toFormat('yyyy-MM-dd');
}

export function getDefaultToDateDisplay(): string {
  const dt = getDefaultToDateTime();
  return dt.toFormat('yyyy-MM-dd');
}

export function isRelativeTime(input: string): boolean {
  return ms(input) !== undefined;
}

export function parseBillingDate(
  dateStr: string,
  isEndDate: boolean = false
): string {
  const relativeMs = ms(dateStr);
  if (relativeMs !== undefined) {
    return new Date(Date.now() - relativeMs).toISOString();
  }

  if (dateStr.includes('T')) {
    const dt = DateTime.fromISO(dateStr);
    if (!dt.isValid) {
      throw new Error(
        `Invalid date: "${dateStr}". Expected YYYY-MM-DD, ISO 8601 (YYYY-MM-DDTHH:mm:ss), or relative (7d)`
      );
    }
    return dateStr;
  }

  // Validate YYYY-MM-DD format
  const laDateTime = DateTime.fromISO(dateStr, { zone: LA_TIMEZONE }).startOf(
    'day'
  );

  if (!laDateTime.isValid) {
    throw new Error(
      `Invalid date: "${dateStr}". Expected YYYY-MM-DD, ISO 8601, or relative (7d)`
    );
  }

  const finalDateTime = isEndDate ? laDateTime.plus({ days: 1 }) : laDateTime;
  return toISOOrThrow(finalDateTime.toUTC());
}

function getISOWeekNumber(dateStr: string): number {
  const date = new Date(dateStr);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return weekNo;
}

function getISOWeekYear(dateStr: string): number {
  const date = new Date(dateStr);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  return date.getUTCFullYear();
}

export function getPeriodKey(
  chargePeriodStart: string,
  breakdownPeriod: BreakdownPeriod
): string {
  if (!chargePeriodStart) {
    return 'Unknown';
  }

  switch (breakdownPeriod) {
    case 'daily':
      // Return YYYY-MM-DD
      return chargePeriodStart.substring(0, 10);

    case 'weekly': {
      // Return YYYY-Www format (ISO week)
      const weekYear = getISOWeekYear(chargePeriodStart);
      const weekNum = getISOWeekNumber(chargePeriodStart);
      return `${weekYear}-W${weekNum.toString().padStart(2, '0')}`;
    }

    case 'monthly':
      // Return YYYY-MM
      return chargePeriodStart.substring(0, 7);

    default:
      return chargePeriodStart.substring(0, 10);
  }
}

export const VALID_BREAKDOWN_PERIODS: BreakdownPeriod[] = [
  'daily',
  'weekly',
  'monthly',
];

export function isValidBreakdownPeriod(
  value: string | undefined
): value is BreakdownPeriod {
  return (
    value !== undefined &&
    VALID_BREAKDOWN_PERIODS.includes(value as BreakdownPeriod)
  );
}
