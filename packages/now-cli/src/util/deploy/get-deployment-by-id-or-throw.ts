import { NowError } from '../now-error';
import Client from '../client';
import getDeploymentByIdOrHost from './get-deployment-by-id-or-host';

export default async function getDeploymentByIdOrThrow(
  client: Client,
  contextName: string,
  idOrHost: string
) {
  const deployment = await getDeploymentByIdOrHost(
    client,
    contextName,
    idOrHost
  );
  if (deployment instanceof NowError) {
    throw deployment;
  }
  return deployment;
}
