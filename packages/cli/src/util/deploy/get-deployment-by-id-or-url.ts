import chalk from 'chalk';
import getDeployment from '../get-deployment';
import getTeamById from '../teams/get-team-by-id';
import { isValidName } from '../is-valid-name';
import type Client from '../client';
import type { Deployment, Team } from '@vercel-internals/types';

export async function getDeploymentByIdOrURL({
  client,
  contextName,
  deployId,
}: {
  client: Client;
  contextName: string;
  deployId: string;
}): Promise<Deployment> {
  const { config, output } = client;

  if (!isValidName(deployId)) {
    throw new Error(
      `The provided argument "${deployId}" is not a valid deployment or project`
    );
  }

  let deployment: Deployment;
  let team: Team | undefined;

  try {
    output.spinner(
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

    // re-render the spinner text because it goes so fast
    output.log(
      `Fetching deployment "${deployId}" in ${chalk.bold(contextName)}…`
    );
  } finally {
    output.stopSpinner();
  }

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

  return deployment;
}
