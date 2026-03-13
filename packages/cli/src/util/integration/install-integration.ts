import type Client from '../client';
import type { AcceptedPolicies } from './types';

export async function installMarketplaceIntegration(
  client: Client,
  integrationId: string,
  acceptedPolicies: AcceptedPolicies
): Promise<{ id: string }> {
  return await client.fetch<{ id: string }>(
    `/v2/integrations/integration/${encodeURIComponent(integrationId)}/marketplace/install`,
    {
      method: 'POST',
      json: true,
      body: { acceptedPolicies, source: 'cli' },
    }
  );
}
