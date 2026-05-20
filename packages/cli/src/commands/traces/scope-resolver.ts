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

// Flag values forward to the trace API verbatim — it accepts slug or id for
// both `teamId` and `projectId`.
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
