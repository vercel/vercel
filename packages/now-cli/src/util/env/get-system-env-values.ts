import { Output } from '../output';
import Client from '../client';

export default async function getSystemEnvValues(
  output: Output,
  client: Client,
  projectId: string
) {
  output.debug(`Fetching System Environment Values of project ${projectId}`);
  const url = `/v6/projects/${projectId}/system-env-values`;
  return client.fetch<{ systemEnvValues: string[] }>(url);
}
