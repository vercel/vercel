import type Client from '../client';
import type { IntegrationInstallation } from './types';

export async function createInstallation(
  client: Client,
  teamId: string,
  integrationId: string
) {
  return client.fetch<IntegrationInstallation>(
    '/v1/integrations/installations',
    {
      method: 'POST',
      json: true,
      body: {
        teamId,
        integrationId,
        acceptTerms: true,
      },
    }
  );
}
