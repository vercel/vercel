import type Client from '../client';
import type { Webhook, WebhookEvent } from './types';

type CreateWebhookRequest = {
  url: string;
  events: WebhookEvent[];
  projectIds?: string[];
};

type CreateWebhookResponse = Webhook & {
  secret: string;
};

export default async function createWebhook(
  client: Client,
  payload: CreateWebhookRequest
): Promise<CreateWebhookResponse> {
  return await client.fetch<CreateWebhookResponse>('/v1/webhooks', {
    method: 'POST',
    body: payload,
  });
}
