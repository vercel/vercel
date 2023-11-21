import chalk from 'chalk';
import type Client from '../../util/client.js';
import { getCommandName } from '../../util/pkg-name.js';
import getProjectByDeployment from '../../util/projects/get-project-by-deployment.js';
import ms from 'ms';
import promoteStatus from './status.js';
import confirm from '../../util/input/confirm.js';

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

  if (deployment.target !== 'production' && !yes) {
    const question =
      'This deployment does not target production, therefore promotion will not apply production environment variables. Are you sure you want to continue?';
    const answer = await confirm(client, question, false);
    if (!answer) {
      output.error('Canceled');
      return 0;
    }
  }

  // request the promotion
  await client.fetch(`/v9/projects/${project.id}/promote/${deployment.id}`, {
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
