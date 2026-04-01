/**
 * Input validation / hardening utilities for agent-first CLI.
 *
 * These validators defend against common agent hallucinations:
 * path traversal, control character injection, malformed resource IDs,
 * double-encoded payloads, and invalid flag formats.
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

const VALID: ValidationResult = { valid: true };

/** Reject path traversal attempts (../../.ssh, etc.) */
export function validateSafePath(input: string): ValidationResult {
  // Normalize percent-encoded dots/slashes before checking
  const decoded = safePercentDecode(input);

  // Check both raw and decoded forms
  for (const value of [input, decoded]) {
    if (
      value.includes('..') ||
      value.startsWith('/') ||
      value.startsWith('~')
    ) {
      return {
        valid: false,
        error: `Path traversal detected in "${input}". Use a relative path without ".." or leading "/" or "~".`,
      };
    }
  }

  return VALID;
}

/** Reject control characters (below ASCII 0x20 except \n, \r, \t) */
export function rejectControlChars(
  input: string,
  fieldName: string
): ValidationResult {
  // eslint-disable-next-line no-control-regex
  const controlCharPattern = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
  if (controlCharPattern.test(input)) {
    return {
      valid: false,
      error: `Control characters detected in ${fieldName}. Remove non-printable characters.`,
    };
  }
  return VALID;
}

/** Reject embedded query params in resource IDs (fileId?fields=name) */
export function validateResourceId(
  input: string,
  fieldName: string
): ValidationResult {
  if (input.includes('?') || input.includes('#')) {
    return {
      valid: false,
      error: `Invalid ${fieldName}: resource IDs must not contain "?" or "#". Got "${input}".`,
    };
  }
  return VALID;
}

/** Reject percent-encoded traversals (%2e%2e) before URL encoding */
export function rejectDoubleEncoding(
  input: string,
  fieldName: string
): ValidationResult {
  // Detect percent-encoded dots (%2e, %2E) and slashes (%2f, %2F, %5c, %5C)
  const doubleEncodedPattern = /%(?:2[eE]|2[fF]|5[cC])/;
  if (doubleEncodedPattern.test(input)) {
    return {
      valid: false,
      error: `Percent-encoded traversal detected in ${fieldName}. Use plain text, not encoded values like %2e or %2f.`,
    };
  }
  return VALID;
}

/** Validate KEY=VALUE format for --env, --build-env, --meta flags */
export function validateKeyValue(
  input: string,
  flagName: string
): ValidationResult {
  const eqIndex = input.indexOf('=');
  if (eqIndex === -1) {
    return {
      valid: false,
      error: `Invalid ${flagName} value "${input}". Expected KEY=VALUE format.`,
    };
  }
  const key = input.slice(0, eqIndex);
  if (key.length === 0) {
    return {
      valid: false,
      error: `Invalid ${flagName} value "${input}". Key must not be empty.`,
    };
  }
  return VALID;
}

/** Validate target environment names (production, preview, or custom alphanumeric) */
export function validateTarget(input: string): ValidationResult {
  if (input.length === 0) {
    return { valid: false, error: 'Target must not be empty.' };
  }
  // Allow production, preview, and custom alphanumeric names with hyphens/underscores
  const targetPattern = /^[a-zA-Z0-9_-]+$/;
  if (!targetPattern.test(input)) {
    return {
      valid: false,
      error: `Invalid target "${input}". Target must contain only letters, digits, hyphens, and underscores.`,
    };
  }
  return VALID;
}

type CheckType = 'path' | 'controlChars' | 'resourceId' | 'doubleEncoding';

/** Run all relevant validators on a single input, return first failure */
export function validateInput(
  input: string,
  fieldName: string,
  checks: CheckType[]
): ValidationResult {
  for (const check of checks) {
    let result: ValidationResult;
    switch (check) {
      case 'path':
        result = validateSafePath(input);
        break;
      case 'controlChars':
        result = rejectControlChars(input, fieldName);
        break;
      case 'resourceId':
        result = validateResourceId(input, fieldName);
        break;
      case 'doubleEncoding':
        result = rejectDoubleEncoding(input, fieldName);
        break;
      default: {
        const _exhaustive: never = check;
        throw new Error(`Unknown check: ${_exhaustive}`);
      }
    }
    if (!result.valid) return result;
  }
  return VALID;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Safely decode percent-encoded characters, returning original on failure */
function safePercentDecode(input: string): string {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}
