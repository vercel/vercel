import type Client from '../../util/client';
import type { RollingReleaseDocument } from '@vercel-internals/types';

export interface RR {
  rollingRelease: RollingReleaseDocument;
}
/**
 * Requests a rolling release document.
 * @param {Client} client - The Vercel client instance
 * @param {string} projectId - The projectId to request the rolling release for
 * @param {string} teamId - The team to request the rolling release for
 * @returns {Promise<RollingReleaseDocument>} Resolves an exit code; 0 on success
 */
export default async function requestRollingRelease({
  client,
  projectId,
  teamId,
}: {
  client: Client;
  projectId: string;
  teamId: string;
}): Promise<RollingReleaseDocument> {
  // request the promotion
  const { rollingRelease } = await client.fetch<RR>(
    `/v1/projects/${projectId}/rolling-release?teamId=${teamId}`
  );

  return rollingRelease;
}
