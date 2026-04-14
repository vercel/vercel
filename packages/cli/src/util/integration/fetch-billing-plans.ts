import type Client from '../client';
import type {
  Integration,
  IntegrationProduct,
  Metadata,
  BillingPlan,
} from './types';

export async function fetchBillingPlans(
  client: Client,
  integration: Integration,
  product: IntegrationProduct,
  metadata: Metadata,
  installationId?: string
) {
  const searchParams = new URLSearchParams();
  searchParams.set('metadata', JSON.stringify(metadata));
  if (installationId) {
    searchParams.set('integrationConfigurationId', installationId);
  }

  return client.fetch<{ plans: BillingPlan[] }>(
    `/v1/integrations/integration/${integration.id}/products/${product.id}/plans?${searchParams}`,
    {
      json: true,
    }
  );
}
