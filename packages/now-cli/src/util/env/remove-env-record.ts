import { Output } from '../output';
import Client from '../client';
import { ProjectEnvTarget } from '../../types';

type Response = {};

export default async function removeEnvRecord(
  output: Output,
  client: Client,
  projectId: string,
  envName: string,
  target?: ProjectEnvTarget
): Promise<void> {
  output.debug(
    `Removing environment variable ${envName} from target ${target}`
  );

  const qs = target ? `?target=${encodeURIComponent(target)}` : '';
  const urlProject = `/v4/projects/${projectId}/env/${encodeURIComponent(
    envName
  )}${qs}`;
  await client.fetch<Response>(urlProject, {
    method: 'DELETE',
  });

  const urlSecret = `/v2/now/secrets/${encodeURIComponent(envName)}`;
  await client.fetch<Response>(urlSecret, {
    method: 'DELETE',
  });
}
