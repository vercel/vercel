import chalk from 'chalk';
import type Client from '../client';
import type { Deployment, Project, Team } from '@vercel-internals/types';
import { getCommandName } from '../pkg-name';
import getDeployment from '../get-deployment';
import getScope from '../get-scope';
import getTeamById from '../teams/get-team-by-id';
import { isValidName } from '../is-valid-name';
import ms from 'ms';
import rollbackStatus from './status';

/**
 * Requests a rollback and waits for it complete.
 * @param {Client} client - The Vercel client instance
 * @param {string} deployId - The deployment name or id to rollback
 * @param {Project} project - Project info instance
 * @param {string} [timeout] - Time to poll for succeeded/failed state
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function requestRollback({
  client,
  deployId,
  project,
  timeout,
}: {
  client: Client;
  deployId: string;
  project: Project;
  timeout?: string;
}): Promise<number> {
  const { config, output } = client;
  const { contextName } = await getScope(client);

  if (!isValidName(deployId)) {
    output.error(
      `The provided argument "${deployId}" is not a valid deployment or project`
    );
    return 1;
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
      output.error(`Failed to retrieve team information: ${teamResult.reason}`);
      return 1;
    }

    if (deploymentResult.status === 'rejected') {
      output.error(deploymentResult.reason);
      return 1;
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
      output.error(
        team
          ? `Deployment doesn't belong to current team ${chalk.bold(
              contextName
            )}`
          : `Deployment belongs to a different team`
      );
      output.error(
        `Use ${chalk.bold('vc switch')} to change your current team`
      );
      return 1;
    }
  } else if (team) {
    output.error(
      `Deployment doesn't belong to current team ${chalk.bold(contextName)}`
    );
    output.error(`Use ${chalk.bold('vc switch')} to change your current team`);
    return 1;
  }

  // create the rollback
  await client.fetch<any>(
    `/v9/projects/${project.id}/rollback/${deployment.id}`,
    {
      body: {}, // required
      method: 'POST',
    }
  );

  if (timeout !== undefined && ms(timeout) === 0) {
    output.log(
      `Successfully requested rollback of ${chalk.bold(project.name)} to ${
        deployment.url
      } (${deployment.id})`
    );
    output.log(`To check rollback status, run ${getCommandName('rollback')}.`);
    return 0;
  }

  // check the status
  return await rollbackStatus({
    client,
    contextName,
    deployment,
    project,
    timeout,
  });
}
