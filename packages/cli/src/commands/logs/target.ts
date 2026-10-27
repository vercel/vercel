import { getPlatformEnv } from '@vercel/build-utils';
import type Client from '../../util/client';
import output from '../../output-manager';
import getDeployment from '../../util/get-deployment';
import { detectExplicitScope } from '../../util/get-scope';
import {
  DeploymentNotFound,
  DeploymentPermissionDenied,
  InvalidDeploymentId,
  ProjectNotFound,
} from '../../util/errors-ts';
import getProjectByIdOrName from '../../util/projects/get-project-by-id-or-name';
import { resolveProjectCwd } from '../../util/projects/find-project-root';
import { getProjectLink } from '../../util/projects/link';
import getTeamByIdOrSlug from '../../util/teams/get-team-by-id-or-slug';
import { getCommandName } from '../../util/pkg-name';
import { AGENT_REASON } from '../../util/agent-output-constants';

export interface LogsTarget {
  readonly teamId: string;
  /** Team slug for display; the team ID when the slug is unavailable. */
  readonly teamLabel: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly deploymentId?: string;
}

export interface LogsTargetError {
  readonly error: string;
  readonly exitCode: number;
  /** Stable reason code for the JSON error document. */
  readonly reason: string;
}

export type LogsTargetResult =
  | { readonly target: LogsTarget }
  | LogsTargetError;

interface LinkIds {
  readonly orgId: string;
  readonly projectId: string;
}

type LinkResult = { readonly link: LinkIds | null } | LogsTargetError;

const NOT_LINKED_MESSAGE = `Your codebase isn't linked to a project on Vercel. Run ${getCommandName(
  'link'
)}, or select a team and project with --scope <team> --project <name>.`;

function fail(reason: string, error: string, exitCode = 1): LogsTargetError {
  return { error, exitCode, reason };
}

/**
 * Reads the link without fetching anything. `VERCEL_ORG_ID` and
 * `VERCEL_PROJECT_ID` take precedence over local link files, matching
 * `getLinkedProject()`.
 *
 * An explicit `--project` first selects its own entry in the link, so a
 * repository link with several projects resolves to that project's team.
 * Without a match, the directory's link still supplies the team.
 */
async function readLink(client: Client, project?: string): Promise<LinkResult> {
  const orgId = getPlatformEnv('ORG_ID');
  const projectId = getPlatformEnv('PROJECT_ID');
  if (orgId && projectId) {
    return { link: { orgId, projectId } };
  }
  if (orgId || projectId) {
    const present = orgId ? '`VERCEL_ORG_ID`' : '`VERCEL_PROJECT_ID`';
    const missing = orgId ? '`VERCEL_PROJECT_ID`' : '`VERCEL_ORG_ID`';
    return fail(
      AGENT_REASON.INVALID_CONFIGURATION,
      `You specified ${present} but you forgot to specify ${missing}. You need to specify both to select a custom project.`
    );
  }

  const path = await resolveProjectCwd(client.cwd);
  if (project) {
    const selected = await getProjectLink(client, path, project, true);
    if (selected) {
      return {
        link: { orgId: selected.orgId, projectId: selected.projectId },
      };
    }
  }
  const link = await getProjectLink(client, path);
  return {
    link: link ? { orgId: link.orgId, projectId: link.projectId } : null,
  };
}

export async function teamLabel(
  client: Client,
  teamId: string
): Promise<string> {
  try {
    const team = await getTeamByIdOrSlug(client, teamId, {
      useCurrentTeam: false,
    });
    return team.slug || teamId;
  } catch (err) {
    output.debug(`Could not fetch team ${teamId}: ${err}`);
    return teamId;
  }
}

function isTeamId(ownerId: string): boolean {
  return ownerId.startsWith('team_');
}

const PERSONAL_ACCOUNT_MESSAGE =
  'Logs are available for team-owned projects only. Select a team with --scope <team>.';

/**
 * Resolves the team and project to query.
 *
 * An explicit team (`--scope`, `--team`, or local config scope) takes
 * precedence over the linked owner; otherwise the link supplies the team.
 * An explicit deployment or project replaces the linked project.
 */
export async function resolveLogsTarget(
  client: Client,
  {
    project: projectOption,
    deployment: deploymentOption,
    deploymentFromArgument = false,
    quiet = false,
  }: {
    project?: string;
    deployment?: string;
    /** The deployment came from the deprecated positional argument. */
    deploymentFromArgument?: boolean;
    quiet?: boolean;
  }
): Promise<LogsTargetResult> {
  const spinner = (message: string) => {
    if (!quiet) output.spinner(message, 1000);
  };
  const explicitScope = detectExplicitScope(client);
  const explicitTeamId = explicitScope ? client.config.currentTeam : undefined;
  if (explicitScope && !explicitTeamId) {
    return fail(AGENT_REASON.MISSING_SCOPE, PERSONAL_ACCOUNT_MESSAGE);
  }

  const replacesLinkedProject = Boolean(projectOption || deploymentOption);
  let link: LinkIds | null = null;
  if (!(explicitTeamId && replacesLinkedProject)) {
    const linkResult = await readLink(client, projectOption);
    if ('error' in linkResult) {
      return linkResult;
    }
    link = linkResult.link;
  }

  const teamId = explicitTeamId ?? link?.orgId;
  if (!teamId) {
    return fail(AGENT_REASON.NOT_LINKED, NOT_LINKED_MESSAGE);
  }
  if (!isTeamId(teamId)) {
    return fail(AGENT_REASON.MISSING_SCOPE, PERSONAL_ACCOUNT_MESSAGE);
  }

  if (!replacesLinkedProject) {
    if (!link) {
      return fail(AGENT_REASON.NOT_LINKED, NOT_LINKED_MESSAGE);
    }
    if (link.orgId !== teamId) {
      const [requested, linked] = await Promise.all([
        teamLabel(client, teamId),
        teamLabel(client, link.orgId),
      ]);
      return fail(
        AGENT_REASON.TARGET_CONFLICT,
        `This directory is linked to a project in team ${linked}, but ${requested} was selected.\n` +
          `Select a project in ${requested} with --project <name>, select the linked team with --scope ${linked}, or run ${getCommandName(
            'link'
          )} to relink.`
      );
    }
  }

  // Lookups below (deployment, project) run in the selected team.
  client.config.currentTeam = teamId;
  const labelPromise = teamLabel(client, teamId);

  let deploymentId: string | undefined;
  let deploymentProjectId: string | undefined;
  if (deploymentOption) {
    const label = await labelPromise;
    spinner(`Resolving deployment "${deploymentOption}"`);
    try {
      const deployment = await getDeployment(client, label, deploymentOption);
      deploymentId = deployment.id;
      deploymentProjectId = deployment.projectId;
    } catch (err) {
      if (
        err instanceof DeploymentNotFound ||
        err instanceof DeploymentPermissionDenied
      ) {
        return fail(
          AGENT_REASON.NOT_FOUND,
          `Deployment not found: ${deploymentOption} under ${label}`
        );
      }
      if (err instanceof InvalidDeploymentId) {
        return fail(
          AGENT_REASON.NOT_FOUND,
          `Invalid deployment ID or URL: ${deploymentOption}`
        );
      }
      throw err;
    } finally {
      output.stopSpinner();
    }
    if (!deploymentProjectId) {
      return fail(
        AGENT_REASON.NOT_FOUND,
        `Deployment ${deploymentOption} is not associated with a project.`
      );
    }
  }

  const projectIdOrName =
    projectOption ?? deploymentProjectId ?? link?.projectId;
  if (!projectIdOrName) {
    return fail(AGENT_REASON.NOT_LINKED, NOT_LINKED_MESSAGE);
  }

  spinner('Retrieving project…');
  let project: Awaited<ReturnType<typeof getProjectByIdOrName>>;
  try {
    project = await getProjectByIdOrName(client, projectIdOrName, teamId);
  } finally {
    output.stopSpinner();
  }
  const label = await labelPromise;
  if (project instanceof ProjectNotFound) {
    if (!projectOption && !deploymentProjectId) {
      return fail(
        AGENT_REASON.PROJECT_NOT_FOUND,
        `The linked project ${projectIdOrName} was not found under ${label}. Run ${getCommandName(
          'link'
        )} to relink, or select a project with --project <name>.`
      );
    }
    return fail(
      AGENT_REASON.PROJECT_NOT_FOUND,
      `Project not found: ${projectIdOrName} under ${label}`
    );
  }

  if (deploymentProjectId && project.id !== deploymentProjectId) {
    const deploymentInput = deploymentFromArgument
      ? 'the deployment argument'
      : '--deployment';
    return fail(
      AGENT_REASON.TARGET_CONFLICT,
      `Deployment ${deploymentOption} does not belong to project ${project.name}. Remove ${deploymentInput} or --project.`
    );
  }

  return {
    target: {
      teamId,
      teamLabel: label,
      projectId: project.id,
      projectName: project.name,
      deploymentId,
    },
  };
}
