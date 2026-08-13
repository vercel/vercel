import type { CustomEnvironmentBranchMatcher } from '@vercel-internals/types';

export const BRANCH_MATCHER_TYPES: CustomEnvironmentBranchMatcher['type'][] = [
  'equals',
  'startsWith',
  'endsWith',
];

export type ParseBranchMatcherResult =
  | { valid: true; branchMatcher: CustomEnvironmentBranchMatcher | undefined }
  | { valid: false; error: string };

/**
 * Validates the `--branch-matcher-type` / `--branch-matcher-pattern` flag pair.
 * Both flags must be provided together, and the type must be one of the
 * supported matcher types.
 */
export function parseBranchMatcher(
  type: string | undefined,
  pattern: string | undefined
): ParseBranchMatcherResult {
  if (type === undefined && pattern === undefined) {
    return { valid: true, branchMatcher: undefined };
  }

  if (type === undefined || pattern === undefined) {
    return {
      valid: false,
      error:
        'Both `--branch-matcher-type` and `--branch-matcher-pattern` must be provided together.',
    };
  }

  if (!BRANCH_MATCHER_TYPES.includes(type as CustomEnvironmentBranchMatcher['type'])) {
    return {
      valid: false,
      error: `Invalid --branch-matcher-type "${type}". Expected one of: ${BRANCH_MATCHER_TYPES.join(
        ', '
      )}.`,
    };
  }

  return {
    valid: true,
    branchMatcher: {
      type: type as CustomEnvironmentBranchMatcher['type'],
      pattern,
    },
  };
}
