import type Client from '../client';
import type { MarketplaceBillingAuthorizationState } from './types';

export async function fetchAuthorization(
  client: Client,
  authorizationId: string
) {
  return client.fetch<MarketplaceBillingAuthorizationState>(
    `/v1/integrations/billing/authorization/${authorizationId}`,
    {
      json: true,
    }
  );
}
