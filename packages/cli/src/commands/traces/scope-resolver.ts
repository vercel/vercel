import type { ProjectLinkResult } from '@vercel-internals/types';

export type ResolvedScope = {
  teamId: string;
  projectId: string;
};

export type ScopeResolutionError = {
  message: string;
};

/**
 * Resolve the team + project scope for `vercel traces` from the linked project
 * stored in `.vercel/project.json`. AGE-5 extends this with `--scope` and
 * `--project` flag fallbacks; for now linked-only.
 *
 * Returns the platform's stable ids (org id = teamId, project id) so the
 * caller can build the trace API request directly.
 */
export function resolveScope({
  linkedProject,
}: {
  linkedProject: ProjectLinkResult;
}): ResolvedScope | ScopeResolutionError {
  if (linkedProject.status === 'linked') {
    return {
      teamId: linkedProject.org.id,
      projectId: linkedProject.project.id,
    };
  }

  return {
    message:
      'No linked project found. Run `vercel link` to link a project to this directory.',
  };
}
