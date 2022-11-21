import chalk from 'chalk';
import type Client from '../client';
import { getCommandName } from '../pkg-name';
import getDeploymentInfo from './get-deployment-info';
import getScope from '../get-scope';
import { isValidName } from '../is-valid-name';
import ms from 'ms';
import type { Project } from '../../types';
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
  const { output } = client;
  const { contextName } = await getScope(client);

  if (!isValidName(deployId)) {
    output.error(
      `The provided argument "${deployId}" is not a valid deployment or project`
    );
    return 1;
  }

  output.spinner(
    `Fetching deployment "${deployId}" in ${chalk.bold(contextName)}…`
  );

  let deployment;
  try {
    deployment = await getDeploymentInfo(client, contextName, deployId);
  } catch (err: any) {
    output.error(err?.toString() || err);
    return 1;
  } finally {
    output.stopSpinner();
    // re-render the spinner text because it goes so fast
    output.log(
      `Fetching deployment "${deployId}" in ${chalk.bold(contextName)}…`
    );
  }

  // create the rollback
  await client.fetch<any>(
    `/v9/projects/${project.id}/rollback/${deployment.uid}`,
    {
      body: {}, // required
      method: 'POST',
    }
  );

  if (timeout !== undefined && ms(timeout) === 0) {
    output.log(
      `Successfully requested rollback of ${chalk.bold(project.name)} to ${
        deployment.url
      } (${deployment.uid})`
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
