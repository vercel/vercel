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
export default async function completeRollingRelease({
  client,
  projectId,
  teamId,
  dpl,
}: {
  client: Client;
  projectId: string;
  teamId: string;
  dpl: string;
}): Promise<number> {
  const { deployment } = await getProjectByDeployment({
    client,
    deployId: dpl,
  });
  // request the completion
  await client.fetch(
    `/v1/projects/${projectId}/rolling-release/complete?teamId=${teamId}`,
    {
      body: { canaryDeploymentId: deployment.id }, // required
      json: true,
      method: 'POST',
    }
  );
  output.log(
    'Successfully requested completion of the active rolling release.'
  );

  return 0;
}
