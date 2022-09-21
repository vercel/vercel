import { NowError } from '../now-error';
import getDeploymentByIdOrHost from './get-deployment-by-id-or-host';
import type Client from '../client';

export default async function getDeploymentByIdOrThrow(
  client: Client,
  contextName: string,
  idOrHost: string,
) {
  const deployment = await getDeploymentByIdOrHost(
    client,
    contextName,
    idOrHost,
  );
  if (deployment instanceof NowError) {
    throw deployment;
  }
  return deployment;
}
