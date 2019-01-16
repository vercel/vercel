import { Alias } from '../../types';
import Client from '../client';

type Response = {
  aliases: Alias[];
};

export default async function getAliases(
  client: Client,
  deploymentId?: string
) {
  const to = deploymentId
    ? `/now/deployments/${deploymentId}/aliases`
    : '/now/aliases';
  const payload = await client.fetch<Response>(to);
  return payload.aliases || [];
}
