import type Client from '../client';
import type { Integration } from '../../commands/integration/types';

export async function fetchIntegration(client: Client, slug: string) {
  return client.fetch<Integration>(
    `/v1/integrations/integration/${slug}?public=1`,
    {
      json: true,
    }
  );
}
