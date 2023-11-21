import chalk from 'chalk';
import type Client from '../../util/client.js';
import { getCommandName } from '../../util/pkg-name.js';
import getProjectByDeployment from '../../util/projects/get-project-by-deployment.js';
import ms from 'ms';
import rollbackStatus from './status.js';

/**
 * Requests a rollback and waits for it complete.
 * @param {Client} client - The Vercel client instance
 * @param {string} deployIdOrUrl - The deployment name or id to rollback
 * @param {string} [timeout] - Time to poll for succeeded/failed state
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function requestRollback({
  client,
  deployId,
  timeout,
}: {
  client: Client;
  deployId: string;
  timeout?: string;
}): Promise<number> {
  const { output } = client;

  const { contextName, deployment, project } = await getProjectByDeployment({
    client,
    deployId,
    output: client.output,
  });

  // create the rollback
  await client.fetch(`/v9/projects/${project.id}/rollback/${deployment.id}`, {
    body: {}, // required
    method: 'POST',
  });

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
