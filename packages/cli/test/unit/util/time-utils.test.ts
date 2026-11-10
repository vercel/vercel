import { describe, expect, it } from 'vitest';
import { parseTimeFlag, resolveTimeRange } from '../../../src/util/time-utils';

const NOW = Date.parse('2026-10-07T14:00:00.000Z');

describe('time-utils', () => {
  it('resolves now, relative, and absolute values against a reference time', () => {
    expect(parseTimeFlag('now', NOW).toISOString()).toBe(
      '2026-10-07T14:00:00.000Z'
    );
    expect(parseTimeFlag('1h', NOW).toISOString()).toBe(
      '2026-10-07T13:00:00.000Z'
    );
    expect(parseTimeFlag('2026-10-01T00:00:00Z', NOW).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z'
    );
  });

  it('rejects invalid values', () => {
    expect(() => parseTimeFlag('soon', NOW)).toThrow('Invalid time format');
  });

  it('keeps the one-hour default range', () => {
    const { startTime, endTime } = resolveTimeRange(undefined, undefined, NOW);
    expect(startTime.toISOString()).toBe('2026-10-07T13:00:00.000Z');
    expect(endTime.toISOString()).toBe('2026-10-07T14:00:00.000Z');
  });
});
