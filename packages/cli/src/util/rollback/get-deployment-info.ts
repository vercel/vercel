import type Client from '../client';
import type { Deployment } from '../../types';
import getDeploymentByIdOrHost from '../deploy/get-deployment-by-id-or-host';
import handleCertError from '../certs/handle-cert-error';

/**
 * Attempts to find the deployment by name or id.
 * @param {Client} client - The Vercel client instance
 * @param {string} contextName - The scope name
 * @param {string} deployId - The deployment name or id to rollback
 * @returns {Promise<Deployment>} Resolves an exit code or deployment info
 */
export default async function getDeploymentInfo(
  client: Client,
  contextName: string,
  deployId: string
): Promise<Deployment> {
  const deployment = handleCertError(
    client.output,
    await getDeploymentByIdOrHost(client, contextName, deployId)
  );

  if (deployment === 1) {
    throw new Error(
      `Failed to get deployment "${deployId}" in scope "${contextName}"`
    );
  }

  if (deployment instanceof Error) {
    throw deployment;
  }

  if (!deployment) {
    throw new Error(`Couldn't find the deployment "${deployId}"`);
  }

  return deployment;
}
