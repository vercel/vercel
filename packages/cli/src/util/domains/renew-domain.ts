import type Client from '../client';
import { DomainChargeOutcomeUnknown, isAPIError } from '../errors-ts';
import getScope from '../get-scope';
import { pollForOrder } from './get-order';

type OrderResponse = {
  orderId: string;
};

/**
 * Renews a domain and returns the finished order. Same contract as
 * `purchaseDomain`: throws only when nothing was charged; a possible charge
 * comes back as `DomainChargeOutcomeUnknown`.
 */
export default async function renewDomain(
  client: Client,
  name: string,
  expectedPrice: number,
  years: number
) {
  const { team } = await getScope(client);
  const teamParam = team ? `?teamId=${team.slug}` : '';

  let orderId: string;
  try {
    ({ orderId } = await client.fetch<OrderResponse>(
      `/v1/registrar/domains/${encodeURIComponent(name)}/renew${teamParam}`,
      {
        method: 'POST',
        body: {
          expectedPrice,
          years,
        },
        // See `purchaseDomain`: no retry, and a 429 fails right away.
        retry: { retries: 0 },
        bailOn429: true,
      }
    ));
  } catch (err: unknown) {
    if (isAPIError(err) && err.status < 500) {
      throw err;
    }
    return new DomainChargeOutcomeUnknown(name, 'renew');
  }

  let order;
  try {
    order = await pollForOrder(client, orderId);
  } catch {
    order = null;
  }
  return order ?? new DomainChargeOutcomeUnknown(name, 'renew');
}
