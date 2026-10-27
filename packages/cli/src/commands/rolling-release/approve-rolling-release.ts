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
export default async function approveRollingRelease({
  client,
  projectId,
  teamId,
  activeStageIndex,
  dpl,
}: {
  client: Client;
  projectId: string;
  teamId: string;
  activeStageIndex: number;
  dpl: string;
}): Promise<number> {
  const { deployment } = await getProjectByDeployment({
    client,
    deployId: dpl,
  });
  await client.fetch(
    `/v1/projects/${projectId}/rolling-release/approve-stage?teamId=${teamId}`,
    {
      method: 'POST',
      json: true,
      body: {
        activeStageIndex,
        nextStageIndex: activeStageIndex + 1,
        canaryDeploymentId: deployment.id,
      },
    }
  );
  output.log(
    `Requested rolling release approval from stage ${activeStageIndex} to ${activeStageIndex + 1} for ${deployment.id}`
  );
  return 0;
}
