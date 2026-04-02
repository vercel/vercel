import { describe, expect, it } from 'vitest';
import {
  validateMutualExclusivity,
  validateRequiredMetric,
} from '../../../../src/commands/metrics/validation';

describe('metrics validation', () => {
  it('rejects missing metric', () => {
    const result = validateRequiredMetric(undefined);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.code).toBe('MISSING_METRIC');
      expect(result.message).toContain('--metric');
    }
  });

  it('keeps --all / --project mutual exclusivity', () => {
    const result = validateMutualExclusivity(true, 'my-app');
    expect(result.valid).toBe(false);
  });
});
