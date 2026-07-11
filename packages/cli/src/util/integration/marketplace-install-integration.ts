import type Client from '../client';
import type { AcceptedPolicies } from './types';

export async function installMarketplaceIntegration(
  client: Client,
  integrationIdOrSlug: string,
  acceptedPolicies: AcceptedPolicies
): Promise<{ id: string } & Record<string, unknown>> {
  return client.fetch<{ id: string }>(
    `/v2/integrations/integration/${encodeURIComponent(integrationIdOrSlug)}/marketplace/install`,
    {
      method: 'POST',
      json: true,
      body: { acceptedPolicies, source: 'cli' },
    }
  );
}
