import type { PaginationOptions } from '@vercel-internals/types';
import type Client from '../client';
import type { Webhook } from './types';

type Response = {
  webhooks: Webhook[];
  pagination: PaginationOptions;
};

export default async function getWebhooks(
  client: Client,
  next?: number,
  limit = 20
): Promise<Response> {
  let url = `/v1/webhooks?limit=${limit}`;
  if (next) {
    url += `&until=${next}`;
  }
  return client.fetch<Response>(url);
}
