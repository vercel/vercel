import type Client from '../client';
import type { Integration, IntegrationInstallation } from './types';

export async function fetchInstallations(
  client: Client,
  integration: Integration,
  teamId: string
) {
  const searchParams = new URLSearchParams();
  searchParams.set('view', 'account');
  searchParams.set('installationType', 'marketplace');
  searchParams.set('integrationIdOrSlug', integration.id);
  searchParams.set('teamId', teamId);
  return client.fetch<IntegrationInstallation[]>(
    `/v2/integrations/configurations?${searchParams}`,
    {
      json: true,
      useCurrentTeam: false,
    }
  );
}
