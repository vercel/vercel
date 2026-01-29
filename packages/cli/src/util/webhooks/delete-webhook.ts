import type Client from '../client';

export default async function deleteWebhook(
  client: Client,
  webhookId: string
): Promise<void> {
  await client.fetch(`/v1/webhooks/${encodeURIComponent(webhookId)}`, {
    method: 'DELETE',
  });
}
