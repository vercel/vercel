import type Client from '../client';
import type { Resource } from '../integration-resource/types';
import type { Team } from '@vercel-internals/types';

export async function deleteResource(
  client: Client,
  resource: Resource,
  team: Team
) {
  const params = new URLSearchParams();
  params.set('teamId', team.id);
  return client.fetch(
    `/v1/storage/stores/integration/${resource.id}?${params}`,
    {
      json: true,
      method: 'DELETE',
    }
  );
}
