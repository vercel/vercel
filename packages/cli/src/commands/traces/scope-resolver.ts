import type { ProjectLinkResult } from '@vercel-internals/types';
import type Client from '../../util/client';
import { AGENT_REASON } from '../../util/agent-output-constants';
import { ProjectNotFound } from '../../util/errors-ts';
import getProjectByNameOrId from '../../util/projects/get-project-by-id-or-name';

export type ResolvedScope = {
  teamId: string;
  projectId: string;
};

export type ScopeResolutionError = {
  reason: string;
  message: string;
};

export type ScopeResolverFlags = {
  scope?: string;
  project?: string;
};

export const MISSING_BOTH_MESSAGE =
  'No linked project found. Run `vercel link`, pass --cwd to a linked dir, or use --scope <team> and --project <name>.';

export async function resolveScope({
  client,
  flags = {},
  linkedProject,
}: {
  client: Client;
  flags?: ScopeResolverFlags;
  linkedProject: ProjectLinkResult;
}): Promise<ResolvedScope | ScopeResolutionError> {
  const flagScope = flags.scope?.trim() || undefined;
  const flagProject = flags.project?.trim() || undefined;

  if (linkedProject.status === 'linked') {
    if (!flagScope && !flagProject) {
      return {
        teamId: linkedProject.org.id,
        projectId: linkedProject.project.id,
      };
    }

    const teamId = flagScope ? client.config.currentTeam : linkedProject.org.id;
    if (!teamId) {
      return {
        reason: AGENT_REASON.NOT_FOUND,
        message: `Team not found: ${flagScope}`,
      };
    }
    const project = await getProjectByNameOrId(
      client,
      flagProject ?? linkedProject.project.id,
      teamId
    );
    if (project instanceof ProjectNotFound) {
      return {
        reason: AGENT_REASON.NOT_FOUND,
        message: `Project not found: ${flagProject}`,
      };
    }
    return {
      teamId,
      projectId: project.id,
    };
  }

  if (flagScope && flagProject) {
    const teamId = client.config.currentTeam;
    if (!teamId) {
      return {
        reason: AGENT_REASON.NOT_FOUND,
        message: `Team not found: ${flagScope}`,
      };
    }
    const project = await getProjectByNameOrId(client, flagProject, teamId);
    if (project instanceof ProjectNotFound) {
      return {
        reason: AGENT_REASON.NOT_FOUND,
        message: `Project not found: ${flagProject}`,
      };
    }
    return { teamId, projectId: project.id };
  }

  return { reason: AGENT_REASON.NOT_LINKED, message: MISSING_BOTH_MESSAGE };
}
