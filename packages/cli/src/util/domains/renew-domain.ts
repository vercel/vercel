import type Client from '../client';
import getScope from '../get-scope';
import { pollForOrder } from './get-order';

type OrderResponse = {
  orderId: string;
};

/**
 * Renews a registered domain. This is a billing event: the account is charged
 * the renewal price for the given number of years.
 *
 * Returns the settled order (or `null` if polling timed out) so the caller can
 * report the final status. Throws `APIError` for the caller to map to messages.
 */
export default async function renewDomain(
  client: Client,
  name: string,
  expectedPrice: number,
  years: number
) {
  const { team } = await getScope(client);
  const teamParam = team ? `?teamId=${team.slug}` : '';

  const { orderId } = await client.fetch<OrderResponse>(
    `/v1/registrar/domains/${encodeURIComponent(name)}/renew${teamParam}`,
    {
      method: 'POST',
      body: {
        expectedPrice,
        years,
      },
    }
  );

  return pollForOrder(client, orderId);
}
