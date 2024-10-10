import type Client from '../client';
import type {
  Integration,
  IntegrationInstallation,
} from '../../commands/integration/types';

export async function fetchInstallations(
  client: Client,
  integration: Integration
) {
  return client.fetch<IntegrationInstallation[]>(
    `/v1/integrations/integration/${integration.id}/installed?source=marketplace`,
    {
      json: true,
    }
  );
}
