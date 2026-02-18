import { describe, expect, it } from 'vitest';
import {
  parseTimeFlag,
  resolveTimeRange,
  toGranularityDuration,
  toGranularityMs,
  computeGranularity,
  roundTimeBoundaries,
} from '../../../../src/commands/metrics/time-utils';

describe('time-utils', () => {
  // ---- Time parsing unit tests ----

  describe('parseTimeFlag', () => {
    it('should parse relative 1h', () => {
      const now = Date.now();
      const result = parseTimeFlag('1h');
      const diff = now - result.getTime();
      // Should be approximately 1 hour (within 1 second tolerance)
      expect(diff).toBeGreaterThan(3599000);
      expect(diff).toBeLessThan(3601000);
    });

    it('should parse relative 30m', () => {
      const now = Date.now();
      const result = parseTimeFlag('30m');
      const diff = now - result.getTime();
      expect(diff).toBeGreaterThan(1799000);
      expect(diff).toBeLessThan(1801000);
    });

    it('should parse relative 2d', () => {
      const now = Date.now();
      const result = parseTimeFlag('2d');
      const diff = now - result.getTime();
      const twoDays = 2 * 24 * 60 * 60 * 1000;
      expect(diff).toBeGreaterThan(twoDays - 1000);
      expect(diff).toBeLessThan(twoDays + 1000);
    });

    it('should parse relative 1w', () => {
      const now = Date.now();
      const result = parseTimeFlag('1w');
      const diff = now - result.getTime();
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      expect(diff).toBeGreaterThan(oneWeek - 1000);
      expect(diff).toBeLessThan(oneWeek + 1000);
    });

    it('should parse ISO 8601 date', () => {
      const result = parseTimeFlag('2025-01-15T10:00:00Z');
      expect(result.toISOString()).toBe('2025-01-15T10:00:00.000Z');
    });

    it('should throw on invalid format', () => {
      expect(() => parseTimeFlag('invalid')).toThrow('Invalid time format');
    });
  });

  describe('resolveTimeRange', () => {
    it('should default to 1h ago to now', () => {
      const now = Date.now();
      const { startTime, endTime } = resolveTimeRange();
      const diff = now - startTime.getTime();
      expect(diff).toBeGreaterThan(3599000);
      expect(diff).toBeLessThan(3601000);
      expect(endTime.getTime()).toBeGreaterThan(now - 1000);
      expect(endTime.getTime()).toBeLessThanOrEqual(now + 1000);
    });

    it('should handle explicit since and until', () => {
      const { startTime, endTime } = resolveTimeRange(
        '2025-01-15T00:00:00Z',
        '2025-01-15T06:00:00Z'
      );
      expect(startTime.toISOString()).toBe('2025-01-15T00:00:00.000Z');
      expect(endTime.toISOString()).toBe('2025-01-15T06:00:00.000Z');
    });
  });

  // ---- Granularity unit tests ----

  describe('toGranularityDuration', () => {
    it('should convert 5m to { minutes: 5 }', () => {
      expect(toGranularityDuration('5m')).toEqual({ minutes: 5 });
    });

    it('should convert 1h to { hours: 1 }', () => {
      expect(toGranularityDuration('1h')).toEqual({ hours: 1 });
    });

    it('should convert 1d to { days: 1 }', () => {
      expect(toGranularityDuration('1d')).toEqual({ days: 1 });
    });

    it('should convert 4h to { hours: 4 }', () => {
      expect(toGranularityDuration('4h')).toEqual({ hours: 4 });
    });

    it('should convert 1w to { days: 7 }', () => {
      expect(toGranularityDuration('1w')).toEqual({ days: 7 });
    });

    it('should convert 90m to { hours: 1.5 } (cross-boundary)', () => {
      expect(toGranularityDuration('90m')).toEqual({ hours: 1.5 });
    });

    it('should convert 60m to { hours: 1 } (boundary)', () => {
      expect(toGranularityDuration('60m')).toEqual({ hours: 1 });
    });

    it('should convert 30s to { minutes: 0.5 }', () => {
      expect(toGranularityDuration('30s')).toEqual({ minutes: 0.5 });
    });

    it('should accept long form "1 hour"', () => {
      expect(toGranularityDuration('1 hour')).toEqual({ hours: 1 });
    });

    it('should accept decimal "2.5h"', () => {
      expect(toGranularityDuration('2.5h')).toEqual({ hours: 2.5 });
    });

    it('should throw on invalid format', () => {
      expect(() => toGranularityDuration('invalid')).toThrow(
        'Invalid granularity format'
      );
    });
  });

  describe('toGranularityMs', () => {
    it('should convert 5m to 300000', () => {
      expect(toGranularityMs('5m')).toBe(300000);
    });

    it('should convert 1h to 3600000', () => {
      expect(toGranularityMs('1h')).toBe(3600000);
    });
  });

  describe('computeGranularity', () => {
    it('should auto-select 1m for ≤1h range', () => {
      const result = computeGranularity(60 * 60 * 1000);
      expect(result.duration).toEqual({ minutes: 1 });
      expect(result.adjusted).toBe(false);
    });

    it('should auto-select 5m for ≤2h range', () => {
      const result = computeGranularity(2 * 60 * 60 * 1000);
      expect(result.duration).toEqual({ minutes: 5 });
      expect(result.adjusted).toBe(false);
    });

    it('should auto-select 15m for ≤12h range', () => {
      const result = computeGranularity(12 * 60 * 60 * 1000);
      expect(result.duration).toEqual({ minutes: 15 });
      expect(result.adjusted).toBe(false);
    });

    it('should auto-select 1h for ≤3d range', () => {
      const result = computeGranularity(3 * 24 * 60 * 60 * 1000);
      expect(result.duration).toEqual({ hours: 1 });
      expect(result.adjusted).toBe(false);
    });

    it('should auto-select 4h for ≤30d range', () => {
      const result = computeGranularity(30 * 24 * 60 * 60 * 1000);
      expect(result.duration).toEqual({ hours: 4 });
      expect(result.adjusted).toBe(false);
    });

    it('should auto-select 1d for >30d range', () => {
      const result = computeGranularity(31 * 24 * 60 * 60 * 1000);
      expect(result.duration).toEqual({ days: 1 });
      expect(result.adjusted).toBe(false);
    });

    it('should adjust 5m to 4h on a 12-day range', () => {
      const rangeMs = 12 * 24 * 60 * 60 * 1000;
      const result = computeGranularity(rangeMs, '5m');
      expect(result.duration).toEqual({ hours: 4 });
      expect(result.adjusted).toBe(true);
      expect(result.notice).toContain('adjusted from 5m to 4h');
    });

    it('should not adjust when explicit is within range', () => {
      const rangeMs = 1 * 60 * 60 * 1000; // 1h
      const result = computeGranularity(rangeMs, '1m');
      expect(result.duration).toEqual({ minutes: 1 });
      expect(result.adjusted).toBe(false);
    });
  });

  describe('roundTimeBoundaries', () => {
    it('should floor start and ceil end to granularity', () => {
      const start = new Date('2025-01-15T10:03:00Z');
      const end = new Date('2025-01-15T10:58:00Z');
      const granMs = 15 * 60 * 1000; // 15m

      const { start: rounded_start, end: rounded_end } = roundTimeBoundaries(
        start,
        end,
        granMs
      );
      expect(rounded_start.toISOString()).toBe('2025-01-15T10:00:00.000Z');
      expect(rounded_end.toISOString()).toBe('2025-01-15T11:00:00.000Z');
    });
  });
});
