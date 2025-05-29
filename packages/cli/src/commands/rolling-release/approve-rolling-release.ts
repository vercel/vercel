import type Client from '../../util/client';
import output from '../../output-manager';

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
  deployId,
}: {
  client: Client;
  projectId: string;
  teamId: string;
  activeStageIndex: number;
  deployId: string;
}): Promise<number> {
  await client.fetch(
    `/v1/projects/${projectId}/rolling-release/approve-stage?teamId=${teamId}`,
    {
      method: 'POST',
      json: true,
      body: {
        activeStageIndex,
        nextStageIndex: activeStageIndex + 1,
        canaryDeploymentId: deployId,
      },
    }
  );
  output.log(
    'Successfully requested approval of rolling release to next stage.'
  );
  return 0;
}
