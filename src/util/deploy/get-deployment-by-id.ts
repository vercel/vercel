import Client from '../client';
import mapCertError from '../certs/map-cert-error';
import {
  DeploymentNotFound,
  DeploymentPermissionDenied,
  InvalidDeploymentId
} from '../errors-ts';

/**
 * Get deployment by id using latest endpoint
 */
export default async function getDeploymentById(
  client: Client,
  contextName: string,
  id: string
) {
  try {
    return await client.fetch(`/v9/now/deployments/${id}`);
  } catch (error) {
    if (error.status === 404) {
      return new DeploymentNotFound({ id, context: contextName });
    }
    if (error.status === 403) {
      return new DeploymentPermissionDenied(id, contextName);
    }
    if (error.status === 400 && error.message.includes('`id`')) {
      return new InvalidDeploymentId(id);
    }

    const mappedError = mapCertError(error);
    if (mappedError) {
      return mappedError;
    }
    throw error;
  }
}
