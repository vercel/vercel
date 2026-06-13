import type Client from '../client';
import type {
  ProjectEnvTarget,
  ProjectEnvVariable,
} from '@vercel-internals/types';
import output from '../../output-manager';

/**
 * Removes a single environment target from a multi-target env record via PATCH,
 * leaving all other targets (and the value) unchanged.
 *
 * @param targetToRemove  The standard target name ("production" | "preview" |
 *                        "development") or a custom environment ID to remove.
 */
export default async function detargetEnvRecord(
  client: Client,
  projectId: string,
  env: ProjectEnvVariable,
  targetToRemove: string
): Promise<void> {
  output.debug(
    `Removing target ${targetToRemove} from Environment Variable ${env.key}`
  );

  const currentTargets: ProjectEnvTarget[] = Array.isArray(env.target)
    ? env.target
    : env.target
      ? [env.target]
      : [];
  const currentCustomIds: string[] = env.customEnvironmentIds ?? [];

  const newTargets = currentTargets.filter(t => t !== targetToRemove);
  const newCustomIds = currentCustomIds.filter(id => id !== targetToRemove);

  const url = `/v10/projects/${projectId}/env/${env.id}`;
  await client.fetch(url, {
    method: 'PATCH',
    body: {
      target: newTargets,
      customEnvironmentIds: newCustomIds.length > 0 ? newCustomIds : undefined,
    },
  });
}
