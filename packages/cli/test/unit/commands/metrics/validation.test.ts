import { describe, expect, it } from 'vitest';
import {
  validateAggregation,
  validateGroupBy,
  validateMetric,
  validateMutualExclusivity,
  validateRequiredMetric,
} from '../../../../src/commands/metrics/validation';
import type { MetricSchemaDetail } from '../../../../src/commands/metrics/types';

const metrics = [
  { id: 'vercel.requests.count', description: 'Count' },
  { id: 'vercel.requests.request_duration_ms', description: 'Duration' },
];

const leafDetail: MetricSchemaDetail = {
  id: 'vercel.requests.count',
  description: 'Count',
  dimensions: [{ name: 'route', label: 'Route' }],
  metrics: [
    {
      id: 'vercel.requests.count',
      description: 'Count',
      unit: 'count',
      aggregations: ['sum'],
      defaultAggregation: 'sum',
    },
  ],
};

describe('metrics validation', () => {
  it('validates known metrics', () => {
    expect(validateMetric(metrics, 'vercel.requests.count')).toEqual({
      valid: true,
    });
  });

  it('rejects missing metric', () => {
    const result = validateRequiredMetric(undefined);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('MISSING_METRIC');
      expect(result.message).toContain('--metric');
    }
  });

  it('validates aggregations and dimensions for a leaf metric', () => {
    expect(validateAggregation(leafDetail, 'sum')).toEqual({
      valid: true,
      value: 'sum',
    });
    expect(validateGroupBy(leafDetail, ['route'])).toEqual({ valid: true });
  });

  it('keeps --all / --project mutual exclusivity', () => {
    const result = validateMutualExclusivity(true, 'my-app');
    expect(result.valid).toBe(false);
  });
});
