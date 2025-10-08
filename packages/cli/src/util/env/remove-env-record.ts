import type Client from '../client';
import type { ProjectEnvVariable } from '@vercel-internals/types';
import output from '../../output-manager';

export default async function removeEnvRecord(
  client: Client,
  projectId: string,
  env: ProjectEnvVariable
): Promise<void> {
  output.debug(`Removing Environment Variable ${env.key}`);

  const url = `/v10/projects/${projectId}/env/${env.id}`;

  await client.fetch<ProjectEnvVariable>(url, {
    method: 'DELETE',
  });
}
