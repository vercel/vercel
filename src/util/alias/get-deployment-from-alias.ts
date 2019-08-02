import Client from '../client';
import { Deployment, Alias } from '../../types';
import fetchDeploymentByIdOrHost from '../deploy/get-deployment-by-id-or-host';

export default async function fetchDeploymentFromAlias(
  client: Client,
  contextName: string,
  prevAlias: Alias | null,
  currentDeployment: Deployment
) {
  return prevAlias &&
    prevAlias.deploymentId &&
    prevAlias.deploymentId !== currentDeployment.uid
    ? fetchDeploymentByIdOrHost(client, contextName, prevAlias.deploymentId)
    : null;
}
