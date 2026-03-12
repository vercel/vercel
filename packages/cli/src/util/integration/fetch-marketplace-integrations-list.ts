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

export async function fetchMarketplaceIntegrationsList(client: Client) {
  return client.fetch<IntegrationListItem[]>(
    '/v2/integrations/integrations?integrationType=marketplace',
    {
      json: true,
    }
  );
}
