import type Client from '../client';
import type { Webhook } from './types';

export default async function getWebhook(
  client: Client,
  webhookId: string
): Promise<Webhook> {
  return await client.fetch<Webhook>(
    `/v1/webhooks/${encodeURIComponent(webhookId)}`
  );
}
