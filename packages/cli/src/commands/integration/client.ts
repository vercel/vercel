import Client from '../../util/client';
import type {
  Integration,
  IntegrationInstallation,
  IntegrationProduct,
  Metadata,
  BillingPlan,
} from './types';

export async function fetchIntegration(client: Client, slug: string) {
  return client.fetch<Integration>(
    `/v1/integrations/integration/${slug}?public=1`,
    {
      json: true,
    }
  );
}

export async function fetchInstallations(
  client: Client,
  integration: Integration
) {
  return client.fetch<IntegrationInstallation[]>(
    `/v1/integrations/integration/${integration.id}/installed?source=marketplace`,
    {
      json: true,
    }
  );
}

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

export async function connectStoreToProject(
  client: Client,
  projectId: string,
  storeId: string,
  environments: string[]
) {
  return client.fetch(`/v1/storage/stores/${storeId}/connections`, {
    json: true,
    method: 'POST',
    body: {
      envVarEnvironments: environments,
      projectId,
      type: 'integration',
    },
  });
}

export async function provisionStoreResource(
  client: Client,
  installationId: string,
  productId: string,
  billingPlanId: string,
  name: string,
  metadata: Metadata
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
      },
    }
  );
}
