import output from '../../output-manager';
import type { IntegrationAddTelemetryClient } from '../telemetry/commands/integration/add';
import type Client from '../client';
import type { Integration } from './types';

export async function fetchIntegration(client: Client, slug: string) {
  return client.fetch<Integration>(`/v2/integrations/integration/${slug}`, {
    json: true,
  });
}

/**
 * Fetch an integration by slug, print errors, and track telemetry.
 * Returns the integration on success, or null on failure (after printing the error).
 */
export async function fetchIntegrationWithTelemetry(
  client: Client,
  integrationSlug: string,
  telemetry: IntegrationAddTelemetryClient
): Promise<Integration | null> {
  let knownIntegrationSlug = false;
  try {
    const integration = await fetchIntegration(client, integrationSlug);
    knownIntegrationSlug = true;
    return integration;
  } catch (error) {
    output.error(
      `Failed to get integration "${integrationSlug}": ${(error as Error).message}`
    );
    return null;
  } finally {
    telemetry.trackCliArgumentIntegration(
      integrationSlug,
      knownIntegrationSlug
    );
  }
}
