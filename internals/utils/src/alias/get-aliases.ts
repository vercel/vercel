import { Alias, PaginationOptions } from '@vercel-internals/types';
import Client from '../client';

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
  const payload = await client.fetch<Response>(to);
  return payload;
}
