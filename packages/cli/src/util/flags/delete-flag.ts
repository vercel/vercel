import type Client from '../client';
import output from '../../output-manager';

export async function deleteFlag(
  client: Client,
  projectId: string,
  flagIdOrSlug: string
): Promise<void> {
  output.debug(
    `Deleting feature flag ${flagIdOrSlug} for project ${projectId}`
  );

  const url = `/v1/projects/${encodeURIComponent(projectId)}/feature-flags/flags/${encodeURIComponent(flagIdOrSlug)}`;
  await client.fetch<void>(url, {
    method: 'DELETE',
  });
}
