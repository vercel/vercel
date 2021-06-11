import { Alias, PaginationOptions } from '../../types';
import Client from '../client';

type Response = {
  aliases: Alias[];
  pagination: PaginationOptions;
};

export default async function getAliases(
  client: Client,
  deploymentId?: string,
  next?: number
) {
  let aliasUrl = `/v3/now/aliases?limit=20`;
  if (next) {
    aliasUrl += `&until=${next}`;
  }
  const to = deploymentId
    ? `/now/deployments/${deploymentId}/aliases`
    : aliasUrl;
  const payload = await client.fetch<Response>(to);
  return payload;
}
