import type Client from '../client';
import type { Resource, ResourceConnection } from './types';

export async function disconnectResourceFromProject(
  client: Client,
  resource: Resource,
  connection: ResourceConnection
) {
  return client.fetch(
    `/v1/storage/stores/${resource.id}/connections/${connection.id}`,
    {
      json: true,
      method: 'DELETE',
    }
  );
}

export async function disconnectResourceFromAllProjects(
  client: Client,
  resource: Resource
) {
  return client.fetch(`/v1/storage/stores/${resource.id}/connections`, {
    json: true,
    method: 'DELETE',
  });
}
