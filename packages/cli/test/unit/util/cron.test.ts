import { describe, expect, it } from 'vitest';
import {
  expandCronField,
  getNextCronDelay,
  parseCronFields,
} from '../../../src/util/cron';

describe('parseCronFields', () => {
  it('parses a valid 5-field expression', () => {
    expect(parseCronFields('*/15 0 1,15 * 1-5')).toEqual({
      minute: '*/15',
      hour: '0',
      dayOfMonth: '1,15',
      month: '*',
      dayOfWeek: '1-5',
    });
  });

  it('returns null for too few fields', () => {
    expect(parseCronFields('* * *')).toBeNull();
  });

  it('returns null for too many fields', () => {
    expect(parseCronFields('* * * * * *')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCronFields('')).toBeNull();
  });

  it('returns null for random text', () => {
    expect(parseCronFields('not a cron')).toBeNull();
  });

  it('handles multiple spaces between fields', () => {
    expect(parseCronFields('*   * *   * *')).toEqual({
      minute: '*',
      hour: '*',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '*',
    });
  });

  it('handles leading and trailing whitespace', () => {
    expect(parseCronFields('  */15 0 1 * 1-5  ')).toEqual({
      minute: '*/15',
      hour: '0',
      dayOfMonth: '1',
      month: '*',
      dayOfWeek: '1-5',
    });
  });
});

describe('expandCronField', () => {
  it('expands wildcard to full range', () => {
    expect(expandCronField('*', 0, 59)).toEqual(
      new Set(Array.from({ length: 60 }, (_, i) => i))
    );
  });

  it('expands wildcard with step', () => {
    expect(expandCronField('*/15', 0, 59)).toEqual(new Set([0, 15, 30, 45]));
  });

  it('expands single value', () => {
    expect(expandCronField('5', 0, 59)).toEqual(new Set([5]));
  });

  it('expands range', () => {
    expect(expandCronField('9-12', 0, 23)).toEqual(new Set([9, 10, 11, 12]));
  });

  it('expands range with step', () => {
    expect(expandCronField('0-30/10', 0, 59)).toEqual(new Set([0, 10, 20, 30]));
  });

  it('expands comma-separated values', () => {
    expect(expandCronField('1,15,30', 0, 59)).toEqual(new Set([1, 15, 30]));
  });

  it('expands mixed comma-separated ranges and values', () => {
    expect(expandCronField('1-3,10,20-22', 0, 59)).toEqual(
      new Set([1, 2, 3, 10, 20, 21, 22])
    );
  });
});

function localDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date {
  return new Date(year, month - 1, day, hour, minute, second);
}

describe('getNextCronDelay', () => {
  it('returns null for invalid expression', () => {
    expect(getNextCronDelay('not a cron')).toBeNull();
    expect(getNextCronDelay('* * *')).toBeNull();
  });

  it('returns null for out-of-range fields', () => {
    // Strict validation rejects garbage that the lax expander would silently
    // accept (and then fail to ever match).
    expect(getNextCronDelay('60 * * * *')).toBeNull();
    expect(getNextCronDelay('0 24 * * *')).toBeNull();
    expect(getNextCronDelay('0 0 0 * *')).toBeNull();
    expect(getNextCronDelay('0 0 * 13 *')).toBeNull();
    expect(getNextCronDelay('0 0 * * 8')).toBeNull();
  });

  it('returns delay for every-minute expression', () => {
    const now = localDate(2025, 6, 15, 10, 30, 15);
    const delay = getNextCronDelay('* * * * *', now);
    // Next minute is 10:31:00, so delay = 45s
    expect(delay).toBe(45_000);
  });

  it('returns delay for specific minute', () => {
    const now = localDate(2025, 6, 15, 10, 30, 0);
    const delay = getNextCronDelay('45 * * * *', now);
    // Next match is 10:45:00, 15 minutes away
    expect(delay).toBe(15 * 60_000);
  });

  it('rolls to next hour when minute has passed', () => {
    const now = localDate(2025, 6, 15, 10, 50, 0);
    const delay = getNextCronDelay('15 * * * *', now);
    // Next match is 11:15:00, 25 minutes away
    expect(delay).toBe(25 * 60_000);
  });

  it('handles specific hour and minute', () => {
    const now = localDate(2025, 6, 15, 8, 0, 0);
    const delay = getNextCronDelay('30 10 * * *', now);
    // Next match is 10:30:00, 2h30m away
    expect(delay).toBe(150 * 60_000);
  });

  it('handles step intervals', () => {
    const now = localDate(2025, 6, 15, 10, 0, 0);
    const delay = getNextCronDelay('*/30 * * * *', now);
    // 10:00 -> next is 10:30
    expect(delay).toBe(30 * 60_000);
  });

  it('handles day-of-week constraint', () => {
    // 2025-06-15 is a Sunday
    const now = localDate(2025, 6, 15, 0, 0, 0);
    expect(now.getDay()).toBe(0);

    // "0 0 * * 1" = Monday at 00:00
    const delay = getNextCronDelay('0 0 * * 1', now);
    // Next Monday is 2025-06-16 00:00, 24h away
    expect(delay).toBe(24 * 60 * 60_000);
  });

  it('treats dow=7 the same as dow=0 (Sunday)', () => {
    // 2025-06-15 is Sunday — at 00:01 the schedule has just missed today's
    // 00:00 firing, so the next match is the same time next week.
    const now = localDate(2025, 6, 15, 0, 1, 0);
    const fromZero = getNextCronDelay('0 0 * * 0', now);
    const fromSeven = getNextCronDelay('0 0 * * 7', now);
    expect(fromZero).not.toBeNull();
    expect(fromSeven).toBe(fromZero);
    // Sanity: it's exactly 7 days minus 1 minute away.
    expect(fromSeven).toBe(7 * 24 * 60 * 60_000 - 60_000);
  });

  it('ORs day-of-month and day-of-week when both are constrained', () => {
    // 2025-06-16 is Monday, day 16
    const now = localDate(2025, 6, 16, 0, 0, 0);
    expect(now.getDay()).toBe(1); // sanity: Monday

    // "0 0 15 * 3" = day 15 OR Wednesday at 00:00
    // 2025-06-18 is Wed -> matches day-of-week
    const delay = getNextCronDelay('0 0 15 * 3', now);
    // Should be 2 days to Wednesday
    expect(delay).toBe(2 * 24 * 60 * 60_000);
  });

  it('ANDs day-of-month when day-of-week is *', () => {
    const now = localDate(2025, 6, 10, 0, 0, 0);
    const delay = getNextCronDelay('0 0 15 * *', now);
    // Next match is June 15 at 00:00, 5 days away
    expect(delay).toBe(5 * 24 * 60 * 60_000);
  });

  it('ANDs day-of-week when day-of-month is *', () => {
    // 2025-06-15 is Sunday (day 0)
    const now = localDate(2025, 6, 15, 0, 0, 0);
    expect(now.getDay()).toBe(0);

    // "0 0 * * 5" = every Friday at 00:00
    const delay = getNextCronDelay('0 0 * * 5', now);
    // Next Friday is 2025-06-20, 5 days away
    expect(delay).toBe(5 * 24 * 60 * 60_000);
  });
});
