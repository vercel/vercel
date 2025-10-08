import type Client from '../client';
import type { Configuration } from './types';
import type { Team } from '@vercel-internals/types';

export async function removeIntegration(
  client: Client,
  configuration: Configuration,
  team: Team
) {
  const params = new URLSearchParams();
  params.set('teamId', team.id);
  return client.fetch(
    `/v2/integrations/installations/${configuration.id}/uninstall?${params}`,
    {
      json: true,
      body: {},
      method: 'POST',
    }
  );
}
