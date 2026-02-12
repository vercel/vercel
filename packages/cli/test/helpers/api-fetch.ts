import type { RequestInit } from 'node-fetch';
import fetch from 'node-fetch';

export const apiFetch = (
  path: string,
  { headers, ...options }: RequestInit = {}
) => {
  const url = new URL(path, 'https://api.vercel.com');
  if (process.env.VERCEL_TEAM_ID) {
    url.searchParams.set('teamId', process.env.VERCEL_TEAM_ID);
  }
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      ...(headers || {}),
    },
    ...options,
  });
};

/**
 * Deletes a project created during e2e tests.
 * Logs errors but does not throw, so test failures are not masked by cleanup failures.
 */
export async function deleteProject(projectName: string): Promise<void> {
  try {
    const response = await apiFetch(`/v2/projects/${projectName}`, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to delete project "${projectName}": ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Failed to delete project "${projectName}":`, error);
  }
}
