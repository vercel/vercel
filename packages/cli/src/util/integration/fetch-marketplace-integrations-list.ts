import type Client from '../client';

type IntegrationListItem = {
  slug: string;
  name: string;
  shortDescription?: string;
  tagIds?: string[];
  products?: { slug: string; name: string }[];
  isMarketplace?: boolean;
  canInstall?: boolean;
};

export async function fetchMarketplaceIntegrations(client: Client) {
  return client.fetch<IntegrationListItem[]>(
    '/v2/integrations/integrations?integrationType=marketplace',
    {
      json: true,
    }
  );
}
