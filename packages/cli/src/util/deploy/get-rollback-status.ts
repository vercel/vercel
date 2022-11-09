import type Client from '../client';

export default async function getRollbackStatus(client: Client): Promise<void> {
  await client.fetch(`/api/v9/projects/:projectId?rollbackInfo=true`);
}
