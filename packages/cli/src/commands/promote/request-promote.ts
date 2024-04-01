import chalk from 'chalk';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import getProjectByDeployment from '../../util/projects/get-project-by-deployment';
import ms from 'ms';
import promoteStatus from './status';
import confirm from '../../util/input/confirm';

/**
 * Requests a promotion and waits for it complete.
 * @param {Client} client - The Vercel client instance
 * @param {string} deployId - The deployment name or id to promote
 * @param {string} [timeout] - Time to poll for succeeded/failed state
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function requestPromote({
  client,
  deployId,
  timeout,
  yes,
}: {
  client: Client;
  deployId: string;
  timeout?: string;
  yes: boolean;
}): Promise<number> {
  const { output } = client;

  const { contextName, deployment, project } = await getProjectByDeployment({
    client,
    deployId,
    output: client.output,
  });

  if (deployment.target !== 'production') {
    output.warn(
      'Promoting a preview deployment to production is deprecated and will be removed in the next major release. This behavior will be removed entirely on 2024-05-03.'
    );
  }

  if (deployment.target !== 'production' && !yes) {
    const question =
      'This deployment is not a production deployment and cannot be directly promoted. A new deployment will be built using your production environment. Are you sure you want to continue?';
    const answer = await confirm(client, question, false);
    if (!answer) {
      output.error('Canceled');
      return 0;
    }
  }

  // request the promotion
  await client.fetch(`/v10/projects/${project.id}/promote/${deployment.id}`, {
    body: {}, // required
    json: false,
    method: 'POST',
  });

  if (timeout !== undefined && ms(timeout) === 0) {
    output.log(
      `Successfully requested promote of ${chalk.bold(project.name)} to ${
        deployment.url
      } (${deployment.id})`
    );
    output.log(`To check promote status, run ${getCommandName('promote')}.`);
    return 0;
  }

  // check the status
  return await promoteStatus({
    client,
    contextName,
    deployment,
    project,
    timeout,
  });
}
