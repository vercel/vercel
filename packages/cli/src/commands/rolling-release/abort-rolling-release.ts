import type Client from '../../util/client';
import output from '../../output-manager';

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
  deployId,
  teamId,
}: {
  client: Client;
  projectId: string;
  deployId: string;
  teamId: string;
}): Promise<number> {
  // create the rollback
  await client.fetch(
    `/v9/projects/${projectId}/rollback/${deployId}?teamId=${teamId}`,
    {
      body: {}, // required
      method: 'POST',
    }
  );

  output.log('Successfully aborted the active rolling release.');

  return 0;
}
