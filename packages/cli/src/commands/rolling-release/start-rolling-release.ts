import type Client from '../../util/client';
import output from '../../output-manager';

/**
 * Requests a rolling release document.
 * @param {Client} client - The Vercel client instance
 * @param {string} projectId - The projectId to request the rolling release for
 * @param {string} teamId - The team to request the rolling release for
 * @returns {Promise<number>} Resolves an exit code; 0 on success
 */
export default async function startRollingRelease({
  client,
  deployId,
  projectId,
  teamId,
}: {
  client: Client;
  deployId: string;
  projectId: string;
  teamId: string;
}): Promise<number> {
  // request the promotion
  await client.fetch(
    `/v10/projects/${projectId}/promote/${deployId}?teamId=${teamId}`,
    {
      body: {}, // required
      json: false,
      method: 'POST',
    }
  );
  output.log('Successfully started rolling release');
  return 0;
}
