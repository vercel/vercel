import chalk from 'chalk';
import type Client from '../client';
import type { Project } from '@vercel-internals/types';
import { getCommandName } from '../pkg-name';
import { getDeploymentByIdOrURL } from '../deploy/get-deployment-by-id-or-url';
import getScope from '../get-scope';
import { isErrnoException } from '@vercel/error-utils';
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
  const { output } = client;
  const { contextName } = await getScope(client);

  try {
    const deployment = await getDeploymentByIdOrURL({
      client,
      contextName,
      deployId,
    });

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
      output.log(
        `To check rollback status, run ${getCommandName('rollback')}.`
      );
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
  } catch (err: unknown) {
    if (isErrnoException(err) && err.code === 'ERR_INVALID_TEAM') {
      output.error(
        `Use ${chalk.bold('vc switch')} to change your current team`
      );
    }
    return 1;
  }
}
