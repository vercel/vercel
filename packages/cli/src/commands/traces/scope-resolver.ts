import type { ProjectLinkResult } from '@vercel-internals/types';

export type ResolvedScope = {
  teamId: string;
  projectId: string;
};

export type ScopeResolutionError = {
  message: string;
};

export type ScopeResolverFlags = {
  scope?: string;
  project?: string;
};

const MISSING_BOTH_MESSAGE =
  'No linked project found. Run `vercel link`, pass --cwd to a linked dir, or use --scope <team> and --project <name>.';

/**
 * Resolve the team + project scope for `vercel traces`. The trace API accepts
 * a team slug or id under `teamId` and a project name or id under `projectId`
 * (see `?teamId=${team.slug}` precedent elsewhere in the CLI), so flag values
 * are forwarded verbatim and the linked project provides stable ids.
 *
 * Resolution order:
 *
 *   1. Both `--scope` and `--project` flags present → use flags.
 *   2. Linked project present → use linked. Flags override individual fields
 *      when provided (e.g. `--scope` alone overrides team but keeps the linked
 *      projectId).
 *   3. Neither linked nor full flag pair → return an actionable error.
 */
export function resolveScope({
  flags = {},
  linkedProject,
}: {
  flags?: ScopeResolverFlags;
  linkedProject: ProjectLinkResult;
}): ResolvedScope | ScopeResolutionError {
  const flagScope = flags.scope?.trim() || undefined;
  const flagProject = flags.project?.trim() || undefined;

  if (linkedProject.status === 'linked') {
    return {
      teamId: flagScope ?? linkedProject.org.id,
      projectId: flagProject ?? linkedProject.project.id,
    };
  }

  if (flagScope && flagProject) {
    return { teamId: flagScope, projectId: flagProject };
  }

  return { message: MISSING_BOTH_MESSAGE };
}
