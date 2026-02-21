import output from '../../output-manager';

const VALID_ACCESS_VALUES = ['public', 'private'] as const;

type BlobAccess = (typeof VALID_ACCESS_VALUES)[number];

function isAccess(value: string): value is BlobAccess {
  return (VALID_ACCESS_VALUES as readonly string[]).includes(value);
}

/**
 * Parses and validates an --access flag value.
 * Returns the validated access value, or null if missing/invalid (with error printed).
 */
export function parseAccessFlag(
  accessFlag: string | undefined
): BlobAccess | null {
  if (accessFlag === undefined) {
    output.error(
      "Missing required --access flag. Must be 'public' or 'private'."
    );
    return null;
  }
  if (!isAccess(accessFlag)) {
    output.error(
      `Invalid access value: '${accessFlag}'. Must be 'public' or 'private'.`
    );
    return null;
  }
  return accessFlag;
}
