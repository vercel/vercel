import { Output } from '../output';
import Client from '../client';
import { ProjectEnvTarget, Secret, ProjectEnvVariable } from '../../types';

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

  const env = await client.fetch<ProjectEnvVariable>(urlProject, {
    method: 'DELETE',
  });

  if (env && env.value) {
    const idOrName = env.value.startsWith('@') ? env.value.slice(1) : env.value;
    const urlSecret = `/v2/now/secrets/${idOrName}`;
    let secret: Secret | undefined;

    try {
      secret = await client.fetch<Secret>(urlSecret);
    } catch (error) {
      if (error && error.status === 404) {
        // User likely deleted the secret before the env var, so we can still report success
        output.debug(
          `Skipped ${env.key} because secret ${idOrName} was already deleted`
        );
        return;
      }
      throw error;
    }

    // Since integrations add global secrets, we must only delete if the secret was
    // specifically added to this project
    if (secret && secret.projectId === projectId) {
      await client.fetch<Secret>(urlSecret, { method: 'DELETE' });
    }
  }
}
