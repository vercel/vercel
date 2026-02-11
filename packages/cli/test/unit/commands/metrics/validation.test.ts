import { describe, expect, it } from 'vitest';
import {
  validateEvent,
  validateDimension,
  validateMeasure,
  validateAggregation,
  formatValidationError,
} from '../../../../src/commands/metrics/validation';

describe('validateEvent', () => {
  it('should accept valid event names', () => {
    expect(validateEvent('incomingRequest')).toEqual({ valid: true });
    expect(validateEvent('functionExecution')).toEqual({ valid: true });
    expect(validateEvent('aiGatewayRequest')).toEqual({ valid: true });
  });

  it('should reject invalid event names', () => {
    const result = validateEvent('unknownEvent');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unknown event "unknownEvent"');
  });

  it('should provide suggestions for typos', () => {
    const result = validateEvent('incomingReques');
    expect(result.valid).toBe(false);
    expect(result.suggestions).toContain('incomingRequest');
  });
});

describe('validateDimension', () => {
  it('should accept valid dimensions for an event', () => {
    expect(validateDimension('incomingRequest', 'httpStatus')).toEqual({
      valid: true,
    });
    expect(validateDimension('incomingRequest', 'requestPath')).toEqual({
      valid: true,
    });
    expect(validateDimension('incomingRequest', 'errorCode')).toEqual({
      valid: true,
    });
  });

  it('should reject invalid dimensions', () => {
    const result = validateDimension('incomingRequest', 'unknownDimension');
    expect(result.valid).toBe(false);
    expect(result.error).toContain(
      'Dimension "unknownDimension" is not available'
    );
  });

  it('should provide suggestions for typos', () => {
    const result = validateDimension('incomingRequest', 'httpStatu');
    expect(result.valid).toBe(false);
    expect(result.suggestions).toContain('httpStatus');
  });
});

describe('validateMeasure', () => {
  it('should accept valid measures for an event', () => {
    expect(validateMeasure('incomingRequest', 'count')).toEqual({
      valid: true,
    });
    expect(validateMeasure('incomingRequest', 'requestDurationMs')).toEqual({
      valid: true,
    });
  });

  it('should reject invalid measures', () => {
    const result = validateMeasure('incomingRequest', 'unknownMeasure');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Measure "unknownMeasure" is not available');
  });

  it('should provide suggestions for typos', () => {
    const result = validateMeasure('incomingRequest', 'requestDuration');
    expect(result.valid).toBe(false);
    expect(result.suggestions).toContain('requestDurationMs');
  });
});

describe('validateAggregation', () => {
  it('should accept valid aggregations for a measure', () => {
    expect(validateAggregation('incomingRequest', 'count', 'sum')).toEqual({
      valid: true,
    });
    expect(
      validateAggregation('incomingRequest', 'requestDurationMs', 'p95')
    ).toEqual({ valid: true });
  });

  it('should reject invalid aggregations', () => {
    const result = validateAggregation('incomingRequest', 'count', 'p95');
    expect(result.valid).toBe(false);
    expect(result.error).toContain(
      'Aggregation "p95" is not valid for measure "count"'
    );
    expect(result.suggestions).toContain('sum');
  });
});

describe('formatValidationError', () => {
  it('should format error without suggestions', () => {
    const result = formatValidationError({
      valid: false,
      error: 'Something went wrong.',
    });
    expect(result).toBe('Something went wrong.');
  });

  it('should format error with suggestions', () => {
    const result = formatValidationError({
      valid: false,
      error: 'Unknown event "test".',
      suggestions: ['testEvent', 'testOperation'],
    });
    expect(result).toContain('Unknown event "test".');
    expect(result).toContain('Did you mean: testEvent, testOperation?');
  });
});
