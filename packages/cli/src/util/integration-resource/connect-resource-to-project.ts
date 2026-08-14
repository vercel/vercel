import type Client from '../client';

interface ConnectResourceOptions {
  accountId?: string;
  envVarPrefix?: string;
}

export async function connectResourceToProject(
  client: Client,
  projectId: string,
  storeId: string,
  environments: string[],
  options?: ConnectResourceOptions
) {
  return client.fetch(`/v1/storage/stores/${storeId}/connections`, {
    json: true,
    method: 'POST',
    body: {
      envVarEnvironments: environments,
      projectId,
      type: 'integration',
      ...(options?.envVarPrefix !== undefined
        ? { envVarPrefix: options.envVarPrefix }
        : {}),
    },
    accountId: options?.accountId,
  });
}
