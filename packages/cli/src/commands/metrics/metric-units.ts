import { isCanonicalAggregation } from './types';
import type { Aggregation } from './types';

const DURATION_UNITS = new Set([
  'nanoseconds',
  'microseconds',
  'milliseconds',
  'seconds',
  'minutes',
  'hours',
  'days',
]);

export function normalizeMetricUnit(unit: string): string {
  return unit
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, ' ');
}

function getPreferredCustomMetricAggregation(unit: string): Aggregation {
  const normalizedUnit = normalizeMetricUnit(unit);
  if (DURATION_UNITS.has(normalizedUnit)) {
    return 'p75';
  }
  if (normalizedUnit === 'percent') {
    return 'avg';
  }
  return 'sum';
}

export function getDefaultCustomMetricAggregation(
  unit: string,
  aggregations: readonly string[] | undefined
): Aggregation {
  const preferredAggregation = getPreferredCustomMetricAggregation(unit);
  if (aggregations?.includes(preferredAggregation)) {
    return preferredAggregation;
  }
  if (aggregations?.includes('sum')) {
    return 'sum';
  }

  return aggregations?.find(isCanonicalAggregation) ?? 'sum';
}
