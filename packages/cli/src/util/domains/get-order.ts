import { isAPIError } from '../errors-ts';
import type Client from '../client';
import sleep from '../sleep';
import getScope from '../get-scope';

type Response = {
  orderId: string;
  domains: {
    domainName: string;
    status: 'pending' | 'completed' | 'failed' | 'refunded' | 'refund-failed';
  }[];
  status: 'draft' | 'purchasing' | 'completed' | 'failed';
  error?: {
    code: 'payment-failed' | 'unexpected-error';
  };
};

export type OrderOutcome =
  | 'completed'
  | 'payment_failed'
  | 'refunded'
  | 'refund_failed'
  | 'failed'
  | 'unknown';

/**
 * What a finished order means for one domain, shared by buy and renew so they
 * report it the same way. Anything not clearly done or clearly failed (an
 * item still pending, or missing) is `unknown`: it may still go through, so
 * running the command again could charge twice.
 */
export function getOrderOutcome(order: Response, domain: string): OrderOutcome {
  const item = order.domains.find(d => d.domainName === domain);
  if (order.status === 'completed' && item?.status === 'completed') {
    return 'completed';
  }
  if (order.error?.code === 'payment-failed') return 'payment_failed';
  if (item?.status === 'refund-failed') return 'refund_failed';
  if (item?.status === 'refunded') return 'refunded';
  if (item?.status === 'failed') return 'failed';
  return 'unknown';
}

export default async function getOrder(client: Client, orderId: string) {
  const { team } = await getScope(client);
  const teamParam = team ? `?teamId=${team.slug}` : '';

  try {
    return await client.fetch<Response>(
      `/v1/registrar/orders/${orderId}${teamParam}`
    );
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.code === 'not_found') {
        return null;
      }

      if (err.status < 500) {
        return err;
      }
    }

    throw err;
  }
}

export const pollForOrder = async (
  client: Client,
  orderId: string,
  timeoutMs: number = 10000
) => {
  const intervalMs = 500;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const order = await getOrder(client, orderId);

    if (
      order !== null &&
      (order.status === 'completed' || order.status === 'failed')
    ) {
      return order;
    }

    await sleep(intervalMs);
  }

  return null;
};
