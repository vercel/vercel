import type Client from '../../util/client';
import output from '../../output-manager';
import getProjectByDeployment from '../../util/projects/get-project-by-deployment';

/**
 * Requests a rolling release document.
 * @param {Client} client - The Vercel client instance
 * @param {string} projectId - The projectId to request the rolling release for
 * @param {string} teamId - The team to request the rolling release for
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function startRollingRelease({
  client,
  dpl,
  projectId,
  teamId,
}: {
  client: Client;
  dpl: string;
  projectId: string;
  teamId: string;
}): Promise<number> {
  const { deployment } = await getProjectByDeployment({
    client,
    deployId: dpl,
  });
  // request the promotion
  await client.fetch(
    `/v10/projects/${projectId}/promote/${deployment.id}?teamId=${teamId}`,
    {
      body: {}, // required
      json: false,
      method: 'POST',
    }
  );
  output.log('Successfully started rolling release');
  return 0;
}
