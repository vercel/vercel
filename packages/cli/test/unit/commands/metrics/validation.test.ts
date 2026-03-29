import { describe, expect, it } from 'vitest';
import {
  validateEvent,
  validateMeasure,
  validateAggregation,
  validateGroupBy,
  validateMutualExclusivity,
  validateRequiredEvent,
} from '../../../../src/commands/metrics/validation';
import type { Schema } from '../../../../src/commands/metrics/schema-api';

const schema: Schema = {
  'vercel.edge_request': {
    description: 'Edge Requests',
    queryEngineEvent: 'incomingRequest',
    dimensions: [
      { name: 'http_status', apiName: 'httpStatus', label: 'HTTP Status' },
      { name: 'route', label: 'Route' },
    ],
    measures: [
      {
        name: 'count',
        label: 'Count',
        unit: 'count',
        aggregations: ['sum', 'persecond', 'percent'],
        defaultAggregation: 'sum',
      },
      {
        name: 'request_duration_ms',
        apiName: 'requestDurationMs',
        label: 'Request Duration',
        unit: 'milliseconds',
        aggregations: ['avg', 'p95'],
        defaultAggregation: 'avg',
      },
    ],
  },
  'vercel.function_execution': {
    description: 'Functions',
    queryEngineEvent: 'functionExecution',
    dimensions: [{ name: 'route', label: 'Route' }],
    measures: [
      {
        name: 'count',
        label: 'Count',
        unit: 'count',
        aggregations: ['sum'],
        defaultAggregation: 'sum',
      },
    ],
  },
};

describe('validation', () => {
  describe('validateEvent', () => {
    it('should pass for known event', () => {
      expect(validateEvent(schema, 'vercel.edge_request')).toEqual({
        valid: true,
      });
    });

    it('should fail for unknown event with available list', () => {
      const result = validateEvent(schema, 'bogus');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('UNKNOWN_EVENT');
        expect(result.allowedValues).toContain('vercel.edge_request');
        expect(result.allowedValues).toContain('vercel.function_execution');
      }
    });
  });

  describe('validateMeasure', () => {
    it('should pass for valid measure', () => {
      expect(validateMeasure(schema, 'vercel.edge_request', 'count')).toEqual({
        valid: true,
      });
    });

    it('should fail for unknown measure with available list', () => {
      const result = validateMeasure(schema, 'vercel.edge_request', 'latency');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('UNKNOWN_MEASURE');
        expect(result.allowedValues).toContain('count');
        expect(result.allowedValues).toContain('request_duration_ms');
      }
    });
  });

  describe('validateAggregation', () => {
    it('should pass for valid aggregation on count', () => {
      expect(
        validateAggregation(schema, 'vercel.edge_request', 'count', 'sum')
      ).toEqual({ valid: true, value: 'sum' });
    });

    it('should fail for invalid aggregation', () => {
      const result = validateAggregation(
        schema,
        'vercel.edge_request',
        'count',
        'p95'
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('INVALID_AGGREGATION');
        expect(result.allowedValues).toEqual(['sum', 'persecond', 'percent']);
      }
    });
  });

  describe('validateGroupBy', () => {
    it('should pass for valid dimensions', () => {
      expect(
        validateGroupBy(schema, 'vercel.edge_request', ['http_status', 'route'])
      ).toEqual({ valid: true });
    });

    it('should fail for unknown dimension with available list', () => {
      const result = validateGroupBy(schema, 'vercel.edge_request', ['bogus']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('UNKNOWN_DIMENSION');
        expect(result.allowedValues).toContain('http_status');
      }
    });
  });

  describe('validateMutualExclusivity', () => {
    it('should pass when only --all is set', () => {
      expect(validateMutualExclusivity(true, undefined)).toEqual({
        valid: true,
      });
    });

    it('should pass when only --project is set', () => {
      expect(validateMutualExclusivity(undefined, 'my-app')).toEqual({
        valid: true,
      });
    });

    it('should pass when neither is set', () => {
      expect(validateMutualExclusivity(undefined, undefined)).toEqual({
        valid: true,
      });
    });

    it('should fail when both --all and --project are set', () => {
      const result = validateMutualExclusivity(true, 'my-app');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('MUTUAL_EXCLUSIVITY');
        expect(result.message).toContain('--all');
        expect(result.message).toContain('--project');
      }
    });
  });

  describe('validateRequiredEvent', () => {
    it('should pass when event is provided', () => {
      expect(validateRequiredEvent('vercel.edge_request')).toEqual({
        valid: true,
        value: 'vercel.edge_request',
      });
    });

    it('should fail when event is undefined', () => {
      const result = validateRequiredEvent(undefined);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('MISSING_EVENT');
        expect(result.message).toContain('--event');
        expect(result.message).toContain('vercel metrics schema');
      }
    });
  });
});
