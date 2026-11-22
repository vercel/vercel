import { describe, expect, it } from 'vitest';
import {
  nextCronOccurrence,
  singleOccurrence,
  validateCronJitter,
} from '../src/timing';

function next(cron: string, after: string, zone = 'UTC'): string {
  return new Date(
    nextCronOccurrence(cron, zone, Date.parse(after))
  ).toISOString();
}

describe('occurrence calculation', () => {
  it('bounds jitter by cron cadence, including wraparound at midnight', () => {
    expect(() => validateCronJitter('* * * * *', 'UTC', 2)).toThrow(/cadence/);
    expect(() => validateCronJitter('0,59 * * * *', 'UTC', 2)).toThrow(
      /cadence/
    );
    expect(() => validateCronJitter('*/15 * * * *', 'UTC', 15)).not.toThrow();
    expect(() => validateCronJitter('0 9 * * 0', 'UTC', 15)).not.toThrow();
  });

  it.each([
    'UTC',
    'America/New_York',
    'Australia/Lord_Howe',
  ])('uses wall-clock cadence for jitter validation in %s', timezone => {
    expect(() => validateCronJitter('0 9 * * *', timezone, 15)).not.toThrow();
    expect(() =>
      validateCronJitter('*/15 * * * *', timezone, 15)
    ).not.toThrow();
    expect(() => validateCronJitter('0,59 * * * *', timezone, 2)).toThrow(
      /cadence/
    );
  });

  it('supports numeric lists, ranges, steps, and Sunday=0', () => {
    expect(next('5,10-20/5 9-17 * * 0', '2026-09-19T00:00:00Z')).toBe(
      '2026-09-20T09:05:00.000Z'
    );
    expect(next('*/15 * * * *', '2026-09-18T01:15:00Z')).toBe(
      '2026-09-18T01:30:00.000Z'
    );
    expect(next('0 0 29 2 *', '2026-09-18T00:00:00Z')).toBe(
      '2028-02-29T00:00:00.000Z'
    );
  });

  it.each([
    '* * * * * *',
    '@daily',
    '0 0 * JAN *',
    '0 0 * * MON',
    '0 0 * * 7',
    '0 0 1 * 1',
    '0 0 L * *',
    '0 0 ? * 1',
    '0 0 * * 1#2',
    '60 * * * *',
    '0 0 31 2 *',
  ])('rejects unsupported/invalid cron %s', cron => {
    expect(() => next(cron, '2026-01-01T00:00:00Z')).toThrow();
  });

  it('uses the supplied timezone, independently of the host timezone', () => {
    expect(next('0 9 * * *', '2026-09-18T00:00:00Z', 'Asia/Kolkata')).toBe(
      '2026-09-18T03:30:00.000Z'
    );
    expect(
      new Date(
        singleOccurrence('2026-09-18T09:00:00', 'America/Los_Angeles')
      ).toISOString()
    ).toBe('2026-09-18T16:00:00.000Z');
  });

  it('skips a nonexistent spring-forward cron time', () => {
    expect(next('30 2 * * *', '2026-03-08T00:00:00Z', 'America/New_York')).toBe(
      '2026-03-09T06:30:00.000Z'
    );
  });

  it('fires a repeated fall-back cron time only at the first offset', () => {
    expect(next('30 1 * * *', '2026-11-01T00:00:00Z', 'America/New_York')).toBe(
      '2026-11-01T05:30:00.000Z'
    );
    expect(next('30 1 * * *', '2026-11-01T05:30:00Z', 'America/New_York')).toBe(
      '2026-11-02T06:30:00.000Z'
    );
    expect(next('* * * * *', '2026-11-01T05:59:00Z', 'America/New_York')).toBe(
      '2026-11-01T07:00:00.000Z'
    );
  });

  it.each([
    '2026-02-30T09:00:00',
    '2026-01-01T09:00:00Z',
    '2026-01-01T09:00:00+01:00',
    '2026-01-01T09:00:00.001',
    '2026-03-08T02:30:00',
    '2026-11-01T01:30:00',
  ])('rejects invalid, nonexistent, or ambiguous one-shot time %s', at => {
    expect(() => singleOccurrence(at, 'America/New_York')).toThrow();
  });
});
