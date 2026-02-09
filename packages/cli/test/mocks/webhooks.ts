import chance from 'chance';
import { client } from './client';
import type { Webhook, WebhookEvent } from '../../src/util/webhooks/types';

export function createWebhook(
  id?: string,
  overrides: Partial<Webhook> = {}
): Webhook {
  const webhookId =
    id || `hook_${chance().string({ length: 16, alpha: true, numeric: true })}`;
  return {
    id: webhookId,
    url: `https://example.com/webhook/${webhookId}`,
    events: ['deployment.created', 'deployment.ready'] as WebhookEvent[],
    ownerId: chance().guid(),
    createdAt: chance().timestamp(),
    updatedAt: chance().timestamp(),
    projectIds: [],
    ...overrides,
  };
}

export function useWebhooks(count = 20) {
  const webhooks = Array.from({ length: count }, (_, i) =>
    createWebhook(`hook_${i}`)
  );

  client.scenario.get('/v1/webhooks', (_req, res) => {
    // Return array directly like the real API does
    res.json(webhooks);
  });

  return webhooks;
}

export function useWebhook(id: string, overrides: Partial<Webhook> = {}) {
  const webhook = createWebhook(id, overrides);

  client.scenario.get(`/v1/webhooks/${encodeURIComponent(id)}`, (_req, res) => {
    res.json(webhook);
  });

  return webhook;
}

export function useWebhookNotFound(id: string) {
  client.scenario.get(`/v1/webhooks/${encodeURIComponent(id)}`, (_req, res) => {
    res.status(404).json({
      error: {
        code: 'not_found',
        message: 'Webhook not found',
      },
    });
  });
}

export function useCreateWebhook() {
  client.scenario.post('/v1/webhooks', (req, res) => {
    const { url, events, projectIds } = req.body;
    const webhook = createWebhook(undefined, {
      url,
      events,
      projectIds,
    });
    res.json({
      ...webhook,
      secret: `whsec_${chance().string({ length: 32, alpha: true, numeric: true })}`,
    });
  });
}

export function useDeleteWebhook(id: string) {
  client.scenario.delete(
    `/v1/webhooks/${encodeURIComponent(id)}`,
    (_req, res) => {
      res.status(204).end();
    }
  );
}

export function useDeleteWebhookNotFound(id: string) {
  client.scenario.delete(
    `/v1/webhooks/${encodeURIComponent(id)}`,
    (_req, res) => {
      res.status(404).json({
        error: {
          code: 'not_found',
          message: 'Webhook not found',
        },
      });
    }
  );
}
