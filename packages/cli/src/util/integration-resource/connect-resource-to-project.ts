import type Client from '../client';

export async function connectResourceToProject(
  client: Client,
  projectId: string,
  storeId: string,
  environments: string[]
) {
  return client.fetch(`/v1/storage/stores/${storeId}/connections`, {
    json: true,
    method: 'POST',
    body: {
      envVarEnvironments: environments,
      projectId,
      type: 'integration',
    },
  });
}
