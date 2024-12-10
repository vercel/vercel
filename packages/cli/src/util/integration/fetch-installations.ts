import type Client from '../client';
import type { Integration, IntegrationInstallation } from './types';

export async function fetchInstallations(
  client: Client,
  integration: Integration
) {
  const searchParams = new URLSearchParams();
  searchParams.set('integrationIdOrSlug', integration.id);
  searchParams.set('installationType', 'marketplace');
  return client.fetch<IntegrationInstallation[]>(
    `/v2/integrations/integration/?${searchParams}`,
    {
      json: true,
    }
  );
}
