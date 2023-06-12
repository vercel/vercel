import chalk from 'chalk';
import type Client from '../client';
import type { Deployment, Project, Team } from '@vercel-internals/types';
import getDeployment from '../get-deployment';
import getProjectByNameOrId from './get-project-by-id-or-name';
import getScope from '../get-scope';
import getTeamById from '../teams/get-team-by-id';
import { isValidName } from '../is-valid-name';
import { Output } from '../output';
import { ProjectNotFound } from '../errors-ts';

export default async function getProjectByDeployment({
  client,
  deployId,
  output,
}: {
  client: Client;
  deployId: string;
  output?: Output;
}): Promise<{
  contextName: string;
  deployment: Deployment;
  project: Project;
}> {
  const { config } = client;
  const { contextName } = await getScope(client);

  if (!isValidName(deployId)) {
    throw new Error(
      `The provided argument "${deployId}" is not a valid deployment ID or URL`
    );
  }

  let deployment: Deployment;
  let team: Team | undefined;

  try {
    output?.spinner(
      `Fetching deployment "${deployId}" in ${chalk.bold(contextName)}…`
    );

    const [teamResult, deploymentResult] = await Promise.allSettled([
      config.currentTeam ? getTeamById(client, config.currentTeam) : undefined,
      getDeployment(client, contextName, deployId),
    ]);

    if (teamResult.status === 'rejected') {
      throw new Error(
        `Failed to retrieve team information: ${teamResult.reason}`
      );
    }

    if (deploymentResult.status === 'rejected') {
      throw new Error(deploymentResult.reason);
    }

    team = teamResult.value;
    deployment = deploymentResult.value;

    // re-render the spinner text
    output?.log(
      `Fetching deployment "${deployId}" in ${chalk.bold(contextName)}…`
    );

    if (deployment.team?.id) {
      if (!team || deployment.team.id !== team.id) {
        const err: NodeJS.ErrnoException = new Error(
          team
            ? `Deployment doesn't belong to current team ${chalk.bold(
                contextName
              )}`
            : `Deployment belongs to a different team`
        );
        err.code = 'ERR_INVALID_TEAM';
        throw err;
      }
    } else if (team) {
      const err: NodeJS.ErrnoException = new Error(
        `Deployment doesn't belong to current team ${chalk.bold(contextName)}`
      );
      err.code = 'ERR_INVALID_TEAM';
      throw err;
    }

    if (!deployment.projectId) {
      throw new Error('Deployment is not associated to a project');
    }

    const project = await getProjectByNameOrId(client, deployment.projectId);
    if (project instanceof ProjectNotFound) {
      throw project;
    }

    return {
      contextName,
      deployment,
      project,
    };
  } finally {
    output?.stopSpinner();
  }
}
