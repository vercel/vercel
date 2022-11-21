import Client from '../client';
import toHost from '../to-host';
import { Deployment } from '../../types';
import {
  DeploymentNotFound,
  DeploymentPermissionDenied,
  InvalidDeploymentId,
  isAPIError,
} from '../errors-ts';
import mapCertError from '../certs/map-cert-error';

type APIVersion = 'v5' | 'v10';

export default async function getDeploymentByIdOrHost(
  client: Client,
  contextName: string,
  idOrHost: string,
  apiVersion: APIVersion = 'v5'
) {
  try {
    const { deployment } =
      idOrHost.indexOf('.') !== -1
        ? await getDeploymentByHost(
            client,
            toHost(idOrHost) as string,
            apiVersion
          )
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

async function getDeploymentById(
  client: Client,
  id: string,
  apiVersion: APIVersion
) {
  const deployment = await client.fetch<Deployment>(
    `/${apiVersion}/now/deployments/${encodeURIComponent(id)}`
  );
  return { deployment };
}

type Response = {
  id: string;
};

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
