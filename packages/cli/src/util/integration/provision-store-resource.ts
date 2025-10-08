import type Client from '../client';
import type { Metadata } from './types';

export async function provisionStoreResource(
  client: Client,
  installationId: string,
  productId: string,
  billingPlanId: string,
  name: string,
  metadata: Metadata,
  authorizationId: string
) {
  return await client.fetch<{ store: { id: string } }>(
    '/v1/storage/stores/integration',
    {
      method: 'POST',
      json: true,
      body: {
        billingPlanId,
        integrationConfigurationId: installationId,
        integrationProductIdOrSlug: productId,
        metadata,
        name,
        authorizationId,
      },
    }
  );
}
