import type { Alias, PaginationOptions } from '@vercel-internals/types';
import type Client from '../client';
import {
  DeploymentNotFound,
  DeploymentPermissionDenied,
  InvalidDeploymentId,
} from '../errors-ts';
import { isAPIError } from '../errors-ts';
import getScope from '../get-scope';

type Response = {
  aliases: Alias[];
  pagination: PaginationOptions;
};

export default async function getAliases(
  client: Client,
  deploymentId?: string,
  next?: number,
  limit = 20
) {
  let aliasUrl = `/v3/now/aliases?limit=${limit}`;
  if (next) {
    aliasUrl += `&until=${next}`;
  }

  const to = deploymentId
    ? `/now/deployments/${deploymentId}/aliases`
    : aliasUrl;

  try {
    const payload = await client.fetch<Response>(to);
    return payload;
  } catch (err) {
    if (isAPIError(err)) {
      const contextName = await getScope(client).then(
        scope => scope.contextName
      );
      if (err.status === 404) {
        throw new DeploymentNotFound({
          id: deploymentId,
          context: contextName,
        });
      }
      if (err.status === 403 && deploymentId) {
        throw new DeploymentPermissionDenied(deploymentId, contextName);
      }
      if (err.status === 400 && err.message.includes('`id`') && deploymentId) {
        throw new InvalidDeploymentId(deploymentId);
      }
    }

    throw err;
  }
}
