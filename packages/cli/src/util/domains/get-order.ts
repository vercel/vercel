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
    code: 'payment_failed' | 'unexpected_error';
  };
};

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
