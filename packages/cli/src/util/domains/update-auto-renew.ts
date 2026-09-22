import type Client from '../client';
import getScope from '../get-scope';

export default async function updateAutoRenew(
  client: Client,
  name: string,
  autoRenew: boolean
) {
  const { team } = await getScope(client);
  const teamParam = team ? `?teamId=${team.slug}` : '';

  return client.fetch(
    `/v1/registrar/domains/${encodeURIComponent(name)}/auto-renew${teamParam}`,
    {
      method: 'PATCH',
      body: {
        autoRenew,
      },
    }
  );
}
