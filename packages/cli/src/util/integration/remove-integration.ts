import type Client from '../client';
import type { Configuration } from './types';

export async function removeIntegration(
  client: Client,
  configuration: Configuration
) {
  return client.fetch(
    `/v2/integrations/installations/${configuration.id}/uninstall`,
    {
      json: true,
      body: {},
      method: 'POST',
    }
  );
}
