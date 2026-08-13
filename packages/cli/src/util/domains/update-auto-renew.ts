import type Client from '../client';
import getScope from '../get-scope';

/**
 * Turns automatic renewal on or off for a registered domain. This does not
 * charge the account; billing only happens when the domain actually renews.
 * Throws `APIError` for the caller to map to messages.
 */
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
