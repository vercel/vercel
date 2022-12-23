import type Client from '../client';
import type { DeploymentV10 } from '../../types';
import getDeploymentByIdOrHost from '../deploy/get-deployment-by-id-or-host';
import type { GetDeploymentByIdOrHostReturnType } from '../deploy/get-deployment-by-id-or-host';
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
): Promise<DeploymentV10> {
  const deployment: DeploymentV10 | GetDeploymentByIdOrHostReturnType | 1 =
    handleCertError<DeploymentV10 | GetDeploymentByIdOrHostReturnType>(
      client.output,
      await getDeploymentByIdOrHost(client, contextName, deployId, 'v10')
    );

  if (deployment === 1) {
    throw new Error(
      `Failed to get deployment "${deployId}" in scope "${contextName}"`
    );
  }

  if (deployment instanceof Error) {
    throw deployment;
  }

  if (deployment === null) {
    throw new Error(`Couldn't find the deployment "${deployId}"`);
  }

  return deployment;
}
