import { describe, expect, it } from 'vitest';
import { validateCronSchedule } from '../../../../src/commands/crons/add';

describe('validateCronSchedule', () => {
  it.each([
    ['* * * * *', 'all wildcards'],
    ['0 0 * * *', 'midnight daily'],
    ['0 10 * * *', 'every day at 10am'],
    ['*/5 * * * *', 'every 5 minutes'],
    ['0 */2 * * *', 'every 2 hours'],
    ['30 8 1 * *', 'first of month at 8:30'],
    ['0 0 * * 0', 'every Sunday (0)'],
    ['0 0 * * 7', 'every Sunday (7)'],
    ['0 9 1-15 * *', 'first half of month at 9am'],
    ['0 9 * 1,6 *', 'Jan and Jun at 9am'],
    ['0,30 * * * *', 'every half hour'],
    ['0 0 1,15 * *', '1st and 15th of month'],
    ['1-30/2 * * * *', 'odd minutes in first half'],
    ['0 0-5 * * *', 'midnight to 5am'],
    ['0 0 * * 1-5', 'weekdays at midnight'],
    ['59 23 31 12 *', 'last minute of the year'],
    ['0 0 1 1 0', 'Jan 1 if Sunday'],
    ['0  10  *  *  *', 'extra whitespace between fields'],
    ['  0 10 * * *  ', 'leading/trailing whitespace'],
  ])('accepts valid: "%s" (%s)', expression => {
    expect(validateCronSchedule(expression)).toBe(true);
  });

  it.each([
    ['* * *', 'too few fields', 'exactly 5 fields'],
    ['* * * * * *', 'too many fields', 'exactly 5 fields'],
    ['*', 'single field', 'exactly 5 fields'],
    ['', 'empty string', 'exactly 5 fields'],
  ])('rejects wrong field count: "%s" (%s)', (expression, _desc, expected) => {
    expect(validateCronSchedule(expression)).toContain(expected);
  });

  it.each([
    ['60 * * * *', 'minute > 59', 'minute'],
    ['-1 * * * *', 'negative minute', 'minute'],
    ['0 24 * * *', 'hour > 23', 'hour'],
    ['0 0 32 * *', 'day of month > 31', 'day of month'],
    ['0 0 0 * *', 'day of month 0', 'day of month'],
    ['0 0 * 13 *', 'month > 12', 'month'],
    ['0 0 * 0 *', 'month 0', 'month'],
    ['0 0 * * 8', 'day of week > 7', 'day of week'],
  ])('rejects out of range: "%s" (%s)', (expression, _desc, field) => {
    const result = validateCronSchedule(expression);
    expect(result).not.toBe(true);
    expect(result).toContain(field);
  });

  it.each([
    ['30-10 * * * *', 'start > end', 'start is greater than end'],
    ['0 0-25 * * *', 'out-of-bounds range', 'out of range'],
    ['a-b * * * *', 'non-numeric range', 'Invalid range'],
  ])('rejects invalid range: "%s" (%s)', (expression, _desc, expected) => {
    expect(validateCronSchedule(expression)).toContain(expected);
  });

  it.each([
    ['*/0 * * * *', 'step of 0', 'Invalid step value'],
    ['*/-1 * * * *', 'negative step', 'Invalid step value'],
    ['*/abc * * * *', 'non-numeric step', 'Invalid step value'],
  ])('rejects invalid step: "%s" (%s)', (expression, _desc, expected) => {
    expect(validateCronSchedule(expression)).toContain(expected);
  });

  it.each([
    ['abc * * * *', 'non-numeric value', 'Invalid value'],
    ['1.5 * * * *', 'float value', 'Invalid value'],
  ])('rejects invalid value: "%s" (%s)', (expression, _desc, expected) => {
    expect(validateCronSchedule(expression)).toContain(expected);
  });

  it('rejects expressions longer than 256 characters', () => {
    const long = `${'0,1,2,3,4,5,6,7,8,9,'.repeat(15)}0 * * * *`;
    expect(long.length).toBeGreaterThan(256);
    expect(validateCronSchedule(long)).toContain('256 characters or less');
  });
});
