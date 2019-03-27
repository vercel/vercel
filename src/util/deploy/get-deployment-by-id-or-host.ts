import Client from '../client';
import toHost from '../to-host';
import { Deployment } from '../../types';
import { DeploymentNotFound, DeploymentPermissionDenied, InvalidDeploymentId } from '../errors-ts';

export default async function getDeploymentByIdOrHost(
  client: Client,
  contextName: string,
  idOrHost: string
) {
  try {
    const { deployment } =
      idOrHost.indexOf('.') !== -1
        ? await getDeploymentByHost(client, toHost(idOrHost) as string)
        : await getDeploymentById(client, idOrHost);
    return deployment;
  } catch (error) {
    if (error.status === 404) {
      return new DeploymentNotFound({ id: idOrHost, context: contextName });
    }
    if (error.status === 403) {
      return new DeploymentPermissionDenied(idOrHost, contextName);
    }
    if (error.status === 400 && error.message.includes('`id`')) {
      return new InvalidDeploymentId(idOrHost);
    }
    throw error;
  }
}

async function getDeploymentById(client: Client, id: string) {
  const deployment = await client.fetch<Deployment>(
    `/v5/now/deployments/${encodeURIComponent(id)}`
  );
  return { deployment };
}

type Response = {
  deployment: {
    id: string;
  };
};

async function getDeploymentByHost(client: Client, host: string) {
  const response = await client.fetch<Response>(
    `/v4/now/hosts/${encodeURIComponent(host)}?resolve=1&noState=1`
  );
  return getDeploymentById(client, response.deployment.id);
}
