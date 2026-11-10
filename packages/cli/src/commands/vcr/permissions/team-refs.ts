/**
 * A single repository permission grant as returned by the
 * `/v1/vcr/repository/:idOrName/permissions` endpoints.
 */
export interface RepositoryPermission {
  repositoryId: string;
  teamId: string;
  teamSlug: string;
  createdAt: string;
}

export interface RepositoryPermissionList {
  permissions: RepositoryPermission[];
  nextCursor?: string;
}

/** A failed add/remove operation for a single team reference. */
export interface TeamOperationFailure {
  team: string;
  code: string;
  message: string;
}

export const MAX_CONCURRENT_REQUESTS = 10;

/**
 * Parses team references from positional arguments. Each argument may contain
 * a single team id/slug or a comma-separated list (`team_123,my-team`).
 * Duplicates are removed while preserving order.
 */
export function parseTeamRefs(args: string[]): string[] {
  const refs: string[] = [];
  for (const arg of args) {
    for (const piece of arg.split(',')) {
      const ref = piece.trim();
      if (ref && !refs.includes(ref)) {
        refs.push(ref);
      }
    }
  }
  return refs;
}

/**
 * Builds the request body for a permission mutation. Team ids are detected by
 * the `team_` prefix; everything else is treated as a team slug (mirrors the
 * dashboard behavior).
 */
export function teamRefBody(
  ref: string
): { teamId: string } | { teamSlug: string } {
  return ref.startsWith('team_') ? { teamId: ref } : { teamSlug: ref };
}
