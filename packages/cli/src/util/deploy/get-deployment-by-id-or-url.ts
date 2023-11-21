import chalk from 'chalk';
import getDeployment from '../get-deployment.js';
import getTeamById from '../teams/get-team-by-id.js';
import { isValidName } from '../is-valid-name.js';
import type Client from '../client.js';
import type { Deployment, Team } from '@vercel-internals/types';

/**
 * Renders feedback while retrieving a deployment, then validates the
 * deployment belongs to the current team.
 *
 * @param client - The CLI client instance.
 * @param contextName - The context/team name.
 * @param deployIdOrUrl - The deployment id or URL.
 * @returns The deployment info.
 */
export async function getDeploymentByIdOrURL({
  client,
  contextName,
  deployIdOrUrl,
}: {
  client: Client;
  contextName: string;
  deployIdOrUrl: string;
}): Promise<Deployment> {
  const { config, output } = client;

  if (!isValidName(deployIdOrUrl)) {
    throw new Error(
      `The provided argument "${deployIdOrUrl}" is not a valid deployment ID or URL`
    );
  }

  let deployment: Deployment;
  let team: Team | undefined;

  try {
    output.spinner(
      `Fetching deployment "${deployIdOrUrl}" in ${chalk.bold(contextName)}…`
    );

    const [teamResult, deploymentResult] = await Promise.allSettled([
      config.currentTeam ? getTeamById(client, config.currentTeam) : undefined,
      getDeployment(client, contextName, deployIdOrUrl),
    ]);

    if (teamResult.status === 'rejected') {
      throw new Error(
        `Failed to retrieve team information: ${teamResult.reason}`
      );
    }

    if (deploymentResult.status === 'rejected') {
      throw new Error(deploymentResult.reason.message);
    }

    team = teamResult.value;
    deployment = deploymentResult.value;

    // re-render the spinner text because it goes so fast
    output.log(
      `Fetching deployment "${deployIdOrUrl}" in ${chalk.bold(contextName)}…`
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
