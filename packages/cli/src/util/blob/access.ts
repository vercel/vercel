import output from '../../output-manager';

const VALID_ACCESS_VALUES = ['public', 'private'] as const;

type BlobAccess = (typeof VALID_ACCESS_VALUES)[number];

function isAccess(value: string): value is BlobAccess {
  return (VALID_ACCESS_VALUES as readonly string[]).includes(value);
}

/**
 * Parses and validates an --access flag value, defaulting to 'public'.
 * Returns the validated access value, or null if invalid (with error printed).
 */
export function parseAccessFlag(
  accessFlag: string | undefined
): BlobAccess | null {
  const access = accessFlag ?? 'public';
  if (!isAccess(access)) {
    output.error(
      `Invalid access value: '${access}'. Must be 'public' or 'private'.`
    );
    return null;
  }
  return access;
}
