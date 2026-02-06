import type Client from '../client';
import type {
  BillingPlan,
  Integration,
  IntegrationProduct,
  Metadata,
} from './types';

export async function fetchBillingPlans(
  client: Client,
  integration: Integration,
  product: IntegrationProduct,
  metadata: Metadata
) {
  const searchParams = new URLSearchParams();
  searchParams.set('metadata', JSON.stringify(metadata));

  return client.fetch<{ plans: BillingPlan[] }>(
    `/v1/integrations/integration/${integration.id}/products/${product.id}/plans?${searchParams}`,
    {
      json: true,
    }
  );
}
