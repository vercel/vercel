import { describe, expect, it } from 'vitest';
import { validateRevokePreviousAfterHours } from '../../../../src/util/kms/signing-keys';

describe('validateRevokePreviousAfterHours', () => {
  it('accepts an omitted value', () => {
    expect(validateRevokePreviousAfterHours(undefined)).toBeNull();
  });

  it('accepts zero and positive values', () => {
    expect(validateRevokePreviousAfterHours(0)).toBeNull();
    expect(validateRevokePreviousAfterHours(24)).toBeNull();
  });

  it('rejects a non-numeric value coerced to NaN', () => {
    expect(validateRevokePreviousAfterHours(Number('soon'))).toBe(
      '--revoke-previous-after-hours must be a number of hours.'
    );
  });

  it('rejects negative values', () => {
    expect(validateRevokePreviousAfterHours(-1)).toBe(
      '--revoke-previous-after-hours must be 0 or more.'
    );
  });
});
