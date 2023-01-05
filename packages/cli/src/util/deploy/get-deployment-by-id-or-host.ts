import type Client from '../client';
import toHost from '../to-host';
import { Deployment } from '../../types';
import {
  DeploymentNotFound,
  DeploymentPermissionDenied,
  InvalidDeploymentId,
  isAPIError,
} from '../errors-ts';
import mapCertError from '../certs/map-cert-error';

type APIVersion = 'v5' | 'v13';

export type GetDeploymentByIdOrHostReturnType =
  | DeploymentNotFound
  | DeploymentPermissionDenied
  | InvalidDeploymentId
  | ReturnType<typeof mapCertError>;

/**
 * Retrieves a deployment by id or host. If host is a URL, the hostname is
 * extracted from the URL.
 * @param client - The Vercel client.
 * @param contextName - The name of the scope/team.
 * @param host - The deployment id or hostname.
 * @param apiVersion - Must be 'v5' or 'v13'.
 */
export default async function getDeploymentByIdOrHost(
  client: Client,
  contextName: string,
  idOrHost: string,
  apiVersion: 'v5'
): Promise<DeploymentV5 | GetDeploymentByIdOrHostReturnType>;
export default async function getDeploymentByIdOrHost(
  client: Client,
  contextName: string,
  idOrHost: string,
  apiVersion: 'v13'
): Promise<DeploymentV13 | GetDeploymentByIdOrHostReturnType>;
export default async function getDeploymentByIdOrHost(
  client: Client,
  contextName: string,
  idOrHost: string,
  apiVersion: APIVersion
): Promise<Deployment | GetDeploymentByIdOrHostReturnType> {
  try {
    const isHost = idOrHost.includes('.');
    if (isHost) {
      idOrHost = toHost(idOrHost);
    }

    const { deployment } =
      apiVersion === 'v5' && isHost
        ? await getDeploymentByHost(client, idOrHost, apiVersion)
        : await getDeploymentById(client, idOrHost, apiVersion);
    return deployment;
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.status === 404) {
        return new DeploymentNotFound({ id: idOrHost, context: contextName });
      }
      if (err.status === 403) {
        return new DeploymentPermissionDenied(idOrHost, contextName);
      }
      if (err.status === 400 && err.message.includes('`id`')) {
        return new InvalidDeploymentId(idOrHost);
      }

      const certError = mapCertError(err);
      if (certError) {
        return certError;
      }
    }

    throw err;
  }
}

/**
 * Fetches a deployment by id.
 * @param client - The Vercel client.
 * @param id - When `apiVersion` is 'v5', `id` must be a deployment id. When
 * `apiVersion` is 'v13', `id` can be either a deployment id or a hostname.
 * @param apiVersion - Must be 'v5' or 'v13'.
 */
async function getDeploymentById(
  client: Client,
  id: string,
  apiVersion: APIVersion
) {
  const deployment = await client.fetch<Deployment>(
    `/${apiVersion}/deployments/${encodeURIComponent(id)}`
  );
  return { deployment };
}

type Response = {
  id: string;
};

/**
 * When `apiVersion` is 'v5', we need to call a different endpoint to resolve
 * the host to the deployment id, then return fetch the deployment by id.
 * @param client - The Vercel client.
 * @param host - The deployment hostname.
 * @param apiVersion - Must be 'v5' or 'v13'.
 */
async function getDeploymentByHost(
  client: Client,
  host: string,
  apiVersion: APIVersion
) {
  const response = await client.fetch<Response>(
    `/v10/now/deployments/get?url=${encodeURIComponent(
      host
    )}&resolve=1&noState=1`
  );
  return getDeploymentById(client, response.id, apiVersion);
}
