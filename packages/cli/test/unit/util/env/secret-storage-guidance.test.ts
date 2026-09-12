import { describe, expect, it } from 'vitest';
import {
  getDefaultSecretStorageGuidance,
  getProductionSecretPolicyErrorKind,
  getProductionSecretPolicyRecovery,
  getSecretStorageChoice,
} from '../../../../src/util/env/secret-storage-guidance';

describe('Secret storage guidance', () => {
  it('explains that Development Secret values can be pulled', () => {
    expect(getSecretStorageChoice(['development'])).toBe(
      'Secret (hidden in the dashboard; Development values can be pulled)'
    );
    expect(getDefaultSecretStorageGuidance(['development'])).toContain(
      'Development values can be pulled'
    );
  });

  it('explains that non-Development Secret values cannot be pulled', () => {
    expect(getSecretStorageChoice(['preview'])).toBe(
      'Secret (hidden in the dashboard and unavailable to pulls)'
    );
    expect(getDefaultSecretStorageGuidance(['production'])).toContain(
      'unavailable to pulls'
    );
  });

  it('includes the Development exception before targets are selected', () => {
    expect(getSecretStorageChoice([], 'for this value')).toBe(
      'Secret (hidden in the dashboard; Development values can be pulled; recommended for this value)'
    );
  });

  it.each([
    [
      'Production secrets must be in their own environment group.',
      'separate-environments',
    ],
    [
      'Production secrets must use a different value than Preview secrets.',
      'different-values',
    ],
    [
      'Production Secret values must be stored separately.',
      'separate-environments',
    ],
  ] as const)('classifies API policy error %s', (message, expected) => {
    expect(getProductionSecretPolicyErrorKind(message)).toBe(expected);
  });

  it('does not classify unrelated API errors', () => {
    expect(getProductionSecretPolicyErrorKind('Branch not found.')).toBeNull();
  });

  it('gives recovery steps that require distinct values', () => {
    expect(getProductionSecretPolicyRecovery('separate-environments')).toBe(
      'Create separate Production and non-Production variables with different values.'
    );
    expect(getProductionSecretPolicyRecovery('different-values')).toBe(
      'Use different Secret values for Production and non-Production.'
    );
  });
});
