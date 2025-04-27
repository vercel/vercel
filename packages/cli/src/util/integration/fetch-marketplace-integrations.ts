import type Client from '../client';
import type { Configuration } from './types';

export async function fetchMarketplaceIntegrations(
  client: Client,
  slug: string
) {
  const searchParams = new URLSearchParams();
  searchParams.set('view', 'account');
  searchParams.set('installationType', 'marketplace');
  searchParams.set('integrationIdOrSlug', slug);
  return await client.fetch<Configuration[]>(
    `/v2/integrations/configurations?${searchParams}`,
    {
      json: true,
    }
  );
}

export async function getFirstConfiguration(
  client: Client,
  integrationSlug: string
) {
  const configurations = await fetchMarketplaceIntegrations(
    client,
    integrationSlug
  );
  return configurations.length > 0 ? configurations[0] : undefined;
}
