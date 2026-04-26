import { describe, expect, it } from 'vitest';
import {
  nextFireAfter,
  parseCronExpression,
  previousFireBefore,
} from '../../../src/util/cron-times';

// Anchor used for most cases. 12:30 UTC is mid-hour and a Monday — useful for
// tests that exercise dom/dow interactions.
const NOW = new Date('2024-01-15T12:30:00.000Z');

function next(schedule: string, now: Date = NOW): string | null {
  const fields = parseCronExpression(schedule);
  if (!fields) throw new Error(`bad schedule: ${schedule}`);
  return nextFireAfter(now, fields)?.toISOString() ?? null;
}

function prev(schedule: string, now: Date = NOW): string | null {
  const fields = parseCronExpression(schedule);
  if (!fields) throw new Error(`bad schedule: ${schedule}`);
  return previousFireBefore(now, fields)?.toISOString() ?? null;
}

describe('parseCronExpression', () => {
  it.each([
    '* * * * *',
    '0 0 * * *',
    '*/5 * * * *',
    '0 */2 * * *',
    '30 8 1 * *',
    '0 0 * * 0',
    '0 0 * * 7',
    '0 9 1-15 * *',
    '0 9 * 1,6 *',
    '0,30 * * * *',
    '1-30/2 * * * *',
    '0 0-5 * * *',
    '0 0 * * 1-5',
    '59 23 31 12 *',
    '  0 10 * * *  ',
    '0  10  *  *  *',
  ])('accepts: "%s"', expr => {
    expect(parseCronExpression(expr)).not.toBeNull();
  });

  it.each([
    '',
    '* * *',
    '* * * * * *',
    '60 * * * *',
    '0 24 * * *',
    '0 0 32 * *',
    '0 0 0 * *',
    '0 0 * 13 *',
    '0 0 * 0 *',
    '0 0 * * 8',
    '30-10 * * * *',
    '0 0-25 * * *',
    'a-b * * * *',
    '*/0 * * * *',
    'not a cron',
    '0 * * * /2',
    '0 * * * 1/',
  ])('rejects: "%s"', expr => {
    expect(parseCronExpression(expr)).toBeNull();
  });

  it('collapses dow=7 onto 0 (both Sunday)', () => {
    const a = parseCronExpression('0 0 * * 0')!;
    const b = parseCronExpression('0 0 * * 7')!;
    expect([...a.dow]).toEqual([...b.dow]);
  });
});

describe('nextFireAfter / previousFireBefore', () => {
  describe('hourly `0 * * * *`', () => {
    it('rolls forward and back from mid-hour', () => {
      expect(next('0 * * * *')).toBe('2024-01-15T13:00:00.000Z');
      expect(prev('0 * * * *')).toBe('2024-01-15T12:00:00.000Z');
    });

    it('treats an exact-boundary `now` as strictly outside', () => {
      const onBoundary = new Date('2024-01-15T12:00:00.000Z');
      expect(next('0 * * * *', onBoundary)).toBe('2024-01-15T13:00:00.000Z');
      expect(prev('0 * * * *', onBoundary)).toBe('2024-01-15T11:00:00.000Z');
    });
  });

  describe('every 5 minutes `*/5 * * * *`', () => {
    it('snaps to the surrounding 5-minute marks', () => {
      expect(next('*/5 * * * *')).toBe('2024-01-15T12:35:00.000Z');
      expect(prev('*/5 * * * *')).toBe('2024-01-15T12:25:00.000Z');
    });
  });

  describe('weekly `15 3 * * 0` (Sundays 03:15Z)', () => {
    it('walks to the next/previous Sunday', () => {
      expect(next('15 3 * * 0')).toBe('2024-01-21T03:15:00.000Z');
      expect(prev('15 3 * * 0')).toBe('2024-01-14T03:15:00.000Z');
    });
  });

  describe('monthly `0 0 1 * *`', () => {
    it('crosses month boundaries', () => {
      expect(next('0 0 1 * *')).toBe('2024-02-01T00:00:00.000Z');
      expect(prev('0 0 1 * *')).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('yearly `0 0 1 1 *`', () => {
    it('crosses the year boundary', () => {
      expect(next('0 0 1 1 *')).toBe('2025-01-01T00:00:00.000Z');
      expect(prev('0 0 1 1 *')).toBe('2024-01-01T00:00:00.000Z');
    });
  });

  describe('dom/dow OR semantics', () => {
    // `0 0 13 * 5` fires on the 13th OR any Friday (standard cron OR rule
    // when both fields are restricted).
    it('fires when EITHER dom or dow matches', () => {
      // 2024-01-13 is a Saturday but dom=13 → must match.
      const sat = new Date('2024-01-13T12:00:00.000Z');
      expect(prev('0 0 13 * 5', sat)).toBe('2024-01-13T00:00:00.000Z');
      // 2024-01-12 is a Friday → must match via dow.
      const fri = new Date('2024-01-12T12:00:00.000Z');
      expect(prev('0 0 13 * 5', fri)).toBe('2024-01-12T00:00:00.000Z');
    });

    it('uses dow alone when dom is `*`', () => {
      // dom=`*`, dow=1 → only Mondays.
      // 2024-01-15 is a Monday; mid-day prev is the same Monday at 00:00.
      expect(prev('0 0 * * 1')).toBe('2024-01-15T00:00:00.000Z');
      // Next Monday after Jan 15 12:30 is Jan 22 00:00.
      expect(next('0 0 * * 1')).toBe('2024-01-22T00:00:00.000Z');
    });

    it('uses dom alone when dow is `*`', () => {
      // dom=15, dow=`*` → only the 15th.
      expect(prev('0 0 15 * *')).toBe('2024-01-15T00:00:00.000Z');
      expect(next('0 0 15 * *')).toBe('2024-02-15T00:00:00.000Z');
    });
  });

  describe('Sunday encoding', () => {
    it('treats dow=0 and dow=7 identically', () => {
      expect(next('15 3 * * 0')).toBe(next('15 3 * * 7'));
      expect(prev('15 3 * * 0')).toBe(prev('15 3 * * 7'));
    });
  });

  describe('impossible expressions', () => {
    it('returns null for `0 0 30 2 *` (Feb 30)', () => {
      const fields = parseCronExpression('0 0 30 2 *')!;
      expect(nextFireAfter(NOW, fields)).toBeNull();
      expect(previousFireBefore(NOW, fields)).toBeNull();
    });
  });

  describe('comma-list and range schedules', () => {
    it('handles `0,30 * * * *`', () => {
      expect(next('0,30 * * * *')).toBe('2024-01-15T13:00:00.000Z');
      expect(prev('0,30 * * * *')).toBe('2024-01-15T12:00:00.000Z');
    });

    it('handles `0 0 * * 1-5` (weekdays at midnight)', () => {
      // Mon Jan 15 12:30 → next weekday midnight is Tue Jan 16 00:00,
      // previous is Mon Jan 15 00:00.
      expect(next('0 0 * * 1-5')).toBe('2024-01-16T00:00:00.000Z');
      expect(prev('0 0 * * 1-5')).toBe('2024-01-15T00:00:00.000Z');
    });
  });

  describe('leap-year handling', () => {
    it('hits Feb 29 in 2024 (leap year)', () => {
      const onJan31 = new Date('2024-01-31T12:00:00.000Z');
      // dom=29 with month=2 — next is Feb 29 2024.
      expect(next('0 0 29 2 *', onJan31)).toBe('2024-02-29T00:00:00.000Z');
    });

    it('skips Feb 29 in non-leap years', () => {
      const onJan31 = new Date('2023-01-31T12:00:00.000Z');
      // 2023 isn't leap → next Feb 29 is in 2024.
      expect(next('0 0 29 2 *', onJan31)).toBe('2024-02-29T00:00:00.000Z');
    });
  });
});
