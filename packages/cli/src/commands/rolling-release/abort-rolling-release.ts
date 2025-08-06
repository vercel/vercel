import type Client from '../../util/client';
import output from '../../output-manager';
import getProjectByDeployment from '../../util/projects/get-project-by-deployment';

/**
 * Requests a rolling release document.
 * @param {Client} client - The Vercel client instance
 * @param {string} projectId - The projectId to request the rolling release for
 * @param {string} deploymentId - The deploymentId to rollback to
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function abortRollingRelease({
  client,
  projectId,
  dpl,
  teamId,
}: {
  client: Client;
  projectId: string;
  dpl: string;
  teamId: string;
}): Promise<number> {
  const { deployment } = await getProjectByDeployment({
    client,
    deployId: dpl,
  });
  // create the rollback
  await client.fetch(
    `/v9/projects/${projectId}/rollback/${deployment.id}?teamId=${teamId}`,
    {
      body: {}, // required
      method: 'POST',
    }
  );

  output.log('Successfully aborted the active rolling release.');

  return 0;
}
