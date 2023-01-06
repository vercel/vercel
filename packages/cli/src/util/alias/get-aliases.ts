import { Alias, PaginationOptions } from '../../types';
import Client from '../client';

type Response = {
  aliases: Alias[];
  pagination: PaginationOptions;
};

type getAliasArgs = {
  client: Client;
  limit: number;
  nextTimestamp?: number;
  deploymentId?: string;
};

export default async function getAliases(args: getAliasArgs) {
  let aliasUrl = `/v3/now/aliases?limit=${args.limit}`;
  if (args.nextTimestamp) {
    aliasUrl += `&until=${args.nextTimestamp}`;
  }

  const to = args.deploymentId
    ? `/now/deployments/${args.deploymentId}/aliases`
    : aliasUrl;
  const payload = await args.client.fetch<Response>(to);
  return payload;
}
