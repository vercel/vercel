import { Output } from '../output';
import Client from '../client';
import { ProjectEnvTarget, ProjectEnvVariableV5 } from '../../types';

export default async function removeEnvRecord(
  output: Output,
  client: Client,
  projectId: string,
  envName: string,
  target?: ProjectEnvTarget
): Promise<void> {
  output.debug(
    `Removing Environment Variable ${envName} from target ${target}`
  );

  const qs = target ? `?target=${encodeURIComponent(target)}` : '';
  const urlProject = `/v4/projects/${projectId}/env/${encodeURIComponent(
    envName
  )}${qs}`;

  await client.fetch<ProjectEnvVariableV5>(urlProject, {
    method: 'DELETE',
  });
}
