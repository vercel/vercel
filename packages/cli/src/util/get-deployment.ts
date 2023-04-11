import type Client from './client';
import {
  DeploymentNotFound,
  DeploymentPermissionDenied,
  InvalidDeploymentId,
  isAPIError,
} from './errors-ts';
import type { Deployment } from '@vercel-internals/types';
import mapCertError from './certs/map-cert-error';
import toHost from './to-host';

/**
 * Retrieves a v13 deployment.
 *
 * @param client - The Vercel CLI client instance.
 * @param contextName - The scope context/team name.
 * @param hostOrId - A deployment host or id.
 * @returns The deployment information.
 */
export default async function getDeployment(
  client: Client,
  contextName: string,
  hostOrId: string
): Promise<Deployment> {
  if (hostOrId.includes('.')) {
    hostOrId = toHost(hostOrId);
  }

  try {
    return await client.fetch<Deployment>(
      `/v13/deployments/${encodeURIComponent(hostOrId)}`
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.status === 404) {
        throw new DeploymentNotFound({ id: hostOrId, context: contextName });
      }
      if (err.status === 403) {
        throw new DeploymentPermissionDenied(hostOrId, contextName);
      }
      if (err.status === 400 && err.message.includes('`id`')) {
        throw new InvalidDeploymentId(hostOrId);
      }

      const certError = mapCertError(err);
      if (certError) {
        throw certError;
      }
    }

    throw err;
  }
}
