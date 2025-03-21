import type Client from '../client';
import type { MarketplaceBillingAuthorizationState, Metadata } from './types';

export async function createAuthorization(
  client: Client,
  installationId: string,
  productId: string,
  billingPlanId: string,
  metadata: Metadata,
  prepaymentAmountCents?: number
) {
  return await client.fetch<{
    authorization: MarketplaceBillingAuthorizationState | null;
  }>('/v1/integrations/billing/authorization', {
    method: 'POST',
    json: true,
    body: {
      billingPlanId,
      integrationConfigurationId: installationId,
      productId,
      metadata,
      prepaymentAmountCents,
    },
  });
}
