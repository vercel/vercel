import { describe, expect, it } from 'vitest';
import {
  validateEvent,
  validateMeasure,
  validateAggregation,
  validateGroupBy,
  validateMutualExclusivity,
  validateRequiredEvent,
} from '../../../../src/commands/metrics/validation';

describe('validation', () => {
  describe('validateEvent', () => {
    it('should pass for known event', () => {
      expect(validateEvent('edgeRequest')).toEqual({ valid: true });
    });

    it('should fail for unknown event with available list', () => {
      const result = validateEvent('bogus');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('UNKNOWN_EVENT');
        expect(result.message).toContain('"bogus"');
        expect(result.allowedValues).toContain('edgeRequest');
        expect(result.allowedValues).toContain('functionExecution');
      }
    });
  });

  describe('validateMeasure', () => {
    it('should pass for valid measure', () => {
      expect(validateMeasure('edgeRequest', 'count')).toEqual({
        valid: true,
      });
    });

    it('should pass for non-count measure', () => {
      expect(validateMeasure('edgeRequest', 'requestDurationMs')).toEqual({
        valid: true,
      });
    });

    it('should fail for unknown measure with available list', () => {
      const result = validateMeasure('edgeRequest', 'latency');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('UNKNOWN_MEASURE');
        expect(result.message).toContain('"latency"');
        expect(result.message).toContain('"edgeRequest"');
        expect(result.allowedValues).toContain('count');
        expect(result.allowedValues).toContain('requestDurationMs');
      }
    });
  });

  describe('validateAggregation', () => {
    it('should pass for valid aggregation on count', () => {
      expect(validateAggregation('edgeRequest', 'count', 'sum')).toEqual({
        valid: true,
        value: 'sum',
      });
    });

    it('should pass for p95 on duration measure', () => {
      expect(
        validateAggregation('edgeRequest', 'requestDurationMs', 'p95')
      ).toEqual({ valid: true, value: 'p95' });
    });

    it('should fail for p95 on count measure', () => {
      const result = validateAggregation('edgeRequest', 'count', 'p95');
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('INVALID_AGGREGATION');
        expect(result.message).toContain('"p95"');
        expect(result.message).toContain('"count"');
        expect(result.allowedValues).toContain('sum');
        expect(result.allowedValues).not.toContain('p95');
      }
    });

    it('should fail for completely invalid aggregation', () => {
      const result = validateAggregation(
        'edgeRequest',
        'requestDurationMs',
        'bogus'
      );
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('INVALID_AGGREGATION');
        expect(result.allowedValues).toContain('p95');
        expect(result.allowedValues).toContain('avg');
      }
    });
  });

  describe('validateGroupBy', () => {
    it('should pass for valid dimensions', () => {
      expect(validateGroupBy('edgeRequest', ['httpStatus', 'route'])).toEqual({
        valid: true,
      });
    });

    it('should fail for unknown dimension with available list', () => {
      const result = validateGroupBy('edgeRequest', ['bogus']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('UNKNOWN_DIMENSION');
        expect(result.message).toContain('"bogus"');
        expect(result.allowedValues).toContain('httpStatus');
      }
    });

    it('should fail for filter-only dimension with suggestion', () => {
      const result = validateGroupBy('functionExecution', ['provider']);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.code).toBe('FILTER_ONLY_DIMENSION');
        expect(result.message).toContain('filter-only');
        expect(result.message).toContain('--filter');
      }
    });

    it('should pass for empty dimensions', () => {
      expect(validateGroupBy('edgeRequest', [])).toEqual({
        valid: true,
      });
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
      expect(validateRequiredEvent('edgeRequest')).toEqual({
        valid: true,
        value: 'edgeRequest',
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
