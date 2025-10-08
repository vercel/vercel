import type Client from '../../util/client';
import type {
  JSONObject,
  ProjectRollingRelease,
} from '@vercel-internals/types';
import output from '../../output-manager';

/**
 * Requests a rolling release document.
 * @param {Client} client - The Vercel client instance
 * @param {string} projectId - The projectId to request the rolling release for
 * @param {string} teamId - The team to request the rolling release for
 * @param {ProjectRollingRelease} rollingReleaseConfig- The rolling release configuration to store.
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function configureRollingRelease({
  client,
  projectId,
  teamId,
  rollingReleaseConfig,
}: {
  client: Client;
  projectId: string;
  teamId: string;
  rollingReleaseConfig: ProjectRollingRelease | undefined;
}): Promise<number> {
  // request the promotion
  const body = {
    ...rollingReleaseConfig,
    enabled: Boolean(rollingReleaseConfig),
  };

  await client.fetch(
    `/v1/projects/${projectId}/rolling-release/config?teamId=${teamId}`,
    {
      body: body as JSONObject,
      json: true,
      method: 'PATCH',
    }
  );

  output.log('Successfully configured rolling releases.');

  return 0;
}
