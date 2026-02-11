/**
 * Webhook event type. Valid events are fetched dynamically from the OpenAPI spec.
 * Use getWebhookEvents() from './get-webhook-events' to get the list of valid events.
 */
export type WebhookEvent = string;

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  ownerId: string;
  createdAt: number;
  updatedAt: number;
  projectIds?: string[];
  projectsMetadata?: {
    id: string;
    name: string;
    framework?: string | null;
  }[];
}
