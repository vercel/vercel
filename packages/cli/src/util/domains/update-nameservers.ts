import type Client from '../client';
import getScope from '../get-scope';

/**
 * Updates the nameservers for a registered domain. Pass an empty array to
 * restore Vercel's default nameservers. Throws `APIError` for the caller to
 * map to messages.
 */
export default async function updateNameservers(
  client: Client,
  name: string,
  nameservers: string[]
) {
  const { team } = await getScope(client);
  const teamParam = team ? `?teamId=${team.slug}` : '';

  return client.fetch(
    `/v1/registrar/domains/${encodeURIComponent(name)}/nameservers${teamParam}`,
    {
      method: 'PATCH',
      body: {
        nameservers,
      },
    }
  );
}
