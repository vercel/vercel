import type Client from '../client';
import type { Webhook } from './types';

type Response = {
  webhooks: Webhook[];
};

type ApiResponse = Webhook[] | { webhooks: Webhook[] };

export default async function getWebhooks(client: Client): Promise<Response> {
  const response = await client.fetch<ApiResponse>('/v1/webhooks');

  // Handle both array response (current API) and object response (future/mock)
  if (Array.isArray(response)) {
    return { webhooks: response };
  }
  return response;
}
