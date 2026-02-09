import type Client from '../client';

type IntegrationCategory = {
  id: string;
  title: string;
};

export async function fetchIntegrationCategories(client: Client) {
  return client.fetch<IntegrationCategory[]>('/v2/integrations/categories', {
    json: true,
  });
}
