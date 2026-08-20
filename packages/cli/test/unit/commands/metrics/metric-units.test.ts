import { describe, expect, it } from 'vitest';
import { getDefaultCustomMetricAggregation } from '../../../../src/commands/metrics/metric-units';

describe('custom metric defaults', () => {
  it.each([
    'nanoseconds',
    'microseconds',
    'milliseconds',
    'seconds',
    'minutes',
    'hours',
    'days',
  ])('defaults %s metrics to p75', unit => {
    expect(
      getDefaultCustomMetricAggregation(unit, ['count', 'sum', 'avg', 'p75'])
    ).toBe('p75');
  });

  it('defaults percent metrics to avg', () => {
    expect(
      getDefaultCustomMetricAggregation('percent', ['sum', 'avg', 'p75'])
    ).toBe('avg');
  });

  it.each([
    'count',
    'units',
    'bytes',
    'kilobytes',
    'megabytes',
    'gigabytes',
    'terabytes',
    'petabytes',
    'gigabyte_hour',
  ])('defaults %s metrics to sum', unit => {
    expect(
      getDefaultCustomMetricAggregation(unit, ['count', 'sum', 'avg', 'p75'])
    ).toBe('sum');
  });

  it('falls back to a catalog-supported aggregation', () => {
    expect(
      getDefaultCustomMetricAggregation('milliseconds', ['avg', 'p95'])
    ).toBe('avg');
  });

  it('skips aggregations unsupported by the canonical query API', () => {
    expect(
      getDefaultCustomMetricAggregation('milliseconds', ['stddev', 'p95'])
    ).toBe('p95');
  });

  it('preserves the sum fallback when the preferred aggregation is unavailable', () => {
    expect(
      getDefaultCustomMetricAggregation('milliseconds', ['count', 'sum', 'avg'])
    ).toBe('sum');
  });
});
