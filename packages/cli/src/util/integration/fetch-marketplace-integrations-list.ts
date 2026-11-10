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
  categories?: string[]
) {
  const params = new URLSearchParams({ integrationType: 'marketplace' });
  if (categories?.length) {
    for (const category of categories) {
      params.append('category', category);
    }
  }
  return client.fetch<IntegrationListItem[]>(
    `/v2/integrations/integrations?${params.toString()}`,
    {
      json: true,
    }
  );
}
