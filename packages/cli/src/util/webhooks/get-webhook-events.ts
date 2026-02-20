import { OpenApiCache } from '../openapi';
import output from '../../output-manager';

let cachedEvents: string[] | null = null;

/**
 * Fetches the list of valid webhook events from the OpenAPI spec.
 * Results are cached in memory after the first fetch.
 */
export async function getWebhookEvents(): Promise<string[]> {
  if (cachedEvents) {
    return cachedEvents;
  }

  const cache = new OpenApiCache();
  const loaded = await cache.load();

  if (!loaded) {
    output.debug('Failed to load OpenAPI spec for webhook events');
    return [];
  }

  const endpoints = cache.getEndpoints();
  const createWebhookEndpoint = endpoints.find(
    e => e.path === '/v1/webhooks' && e.method === 'POST'
  );

  if (!createWebhookEndpoint) {
    output.debug('Could not find POST /v1/webhooks endpoint in OpenAPI spec');
    return [];
  }

  const bodyFields = cache.getBodyFields(createWebhookEndpoint);
  const eventsField = bodyFields.find(f => f.name === 'events');

  if (!eventsField?.enumValues) {
    output.debug('Could not find events enum in webhook endpoint');
    return [];
  }

  cachedEvents = eventsField.enumValues.filter(
    (v): v is string => typeof v === 'string'
  );
  return cachedEvents;
}

/**
 * Validates webhook events against the OpenAPI spec.
 * Returns an array of invalid event names.
 */
export async function validateWebhookEvents(
  events: string[]
): Promise<string[]> {
  const validEvents = await getWebhookEvents();

  // If we couldn't fetch valid events, skip validation
  if (validEvents.length === 0) {
    return [];
  }

  const validSet = new Set(validEvents);
  return events.filter(e => !validSet.has(e));
}
