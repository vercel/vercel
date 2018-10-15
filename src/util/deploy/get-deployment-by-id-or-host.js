// @flow
import { Now } from '../../util/types';
import { DeploymentNotFound, DeploymentPermissionDenied } from '../errors';
import type { Deployment } from '../types';
import toHost from '../to-host';

async function getDeploymentByIdOrHost(
  now: Now,
  contextName: string,
  idOrHost: string
) {
  try {
    const { deployment } =
      idOrHost.indexOf('.') !== -1
        ? await getDeploymentByHost(now, toHost(idOrHost))
        : await getDeploymentById(now, idOrHost);
    return deployment;
  } catch (error) {
    if (error.status === 404) {
      return new DeploymentNotFound(idOrHost, contextName);
    } else if (error.status === 403) {
      return new DeploymentPermissionDenied(idOrHost, contextName);
    } else {
      throw error;
    }
  }
}

async function getDeploymentById(
  now: Now,
  id: string
): Promise<{ deployment: Deployment }> {
  const deployment = await now.fetch(
    `/v5/now/deployments/${encodeURIComponent(id)}`
  );
  return { deployment };
}

type DeploymentHostResponse = {
  deployment: {
    id: string
  }
};

async function getDeploymentByHost(
  now: Now,
  host: string
): Promise<{ deployment: Deployment }> {
  const response: DeploymentHostResponse = await now.fetch(
    `/v4/now/hosts/${encodeURIComponent(host)}?resolve=1&noState=1`
  );
  return getDeploymentById(now, response.deployment.id);
}

export default getDeploymentByIdOrHost;
