import type Client from '../client';
import type { Resource } from '../integration-resource/types';

export async function deleteResource(client: Client, resource: Resource) {
  return client.fetch(`/v1/storage/stores/integration/${resource.id}`, {
    json: true,
    method: 'DELETE',
  });
}
