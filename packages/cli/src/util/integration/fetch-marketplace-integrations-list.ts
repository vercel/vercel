import type Client from '../client';

export type IntegrationListItem = {
  slug: string;
  name: string;
  shortDescription?: string;
  tagIds?: string[];
  products?: {
    slug: string;
    name: string;
    shortDescription?: string;
    tags?: string[];
  }[];
  isMarketplace?: boolean;
  canInstall?: boolean;
};

export async function fetchMarketplaceIntegrationsList(
  client: Client,
  category?: string
) {
  const params = new URLSearchParams({ integrationType: 'marketplace' });
  if (category) {
    params.set('category', category);
  }
  return client.fetch<IntegrationListItem[]>(
    `/v2/integrations/integrations?${params.toString()}`,
    {
      json: true,
    }
  );
}
