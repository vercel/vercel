import type Client from '../client';
import type { Org } from '@vercel-internals/types';
import { isAPIError } from '../errors-ts';
import getUser from '../get-user';
import getTeamById from '../teams/get-team-by-id';

/**
 * Resolves a `team_*` ID to a team `Org`, or a user ID to a user `Org`.
 * Returns `null` if the org could not be resolved.
 */
export default async function getOrgById(
  client: Client,
  orgId: string
): Promise<Org | null> {
  if (orgId.startsWith('team_')) {
    try {
      const team = await getTeamById(client, orgId);
      if (!team) return null;
      return { type: 'team', id: team.id, slug: team.slug };
    } catch (err) {
      // If the linked team no longer exists (or test mocks intentionally omit
      // this endpoint), treat it as "not linked" instead of hard-failing.
      if (
        isAPIError(err) &&
        (err.status === 404 ||
          err.code === 'not_found' ||
          err.code === 'mock_unimplemented')
      ) {
        return null;
      }
      throw err;
    }
  }

  const user = await getUser(client);
  if (user.id !== orgId) return null;
  return { type: 'user', id: orgId, slug: user.username };
}
