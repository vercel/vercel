import type Client from './client';
import {
  NATIVE_BINARY_AUTO_OPT_IN_TEAM_SLUG,
  hasNativeBinaryPreference,
  setUseNativeBinary,
} from './native-binary';
import getTeams from './teams/get-teams';
import output from '../output-manager';

/**
 * Auto-opt-in members of the `vercel` team to the native CLI binary.
 *
 * Membership is checked against every team the user belongs to (not just the
 * currently-selected scope), so a `vercel` member is opted in even while
 * operating on their personal scope or another team. Team slugs are globally
 * unique across the Vercel platform, so matching on the slug is stable without
 * hardcoding a team id.
 *
 * This only does any work — including the teams API call — when the user has no
 * explicit preference yet, so an opt-out via `vercel upgrade --binary false` is
 * always respected and users who already have a preference pay no extra cost.
 * It is best-effort: a failure to read teams or persist config must never break
 * the running command.
 */
export async function maybeAutoOptInNativeBinary(
  client: Client
): Promise<void> {
  if (hasNativeBinaryPreference(client.config)) {
    return;
  }

  try {
    const teams = await getTeams(client);
    const isMember = teams.some(
      team => team.slug === NATIVE_BINARY_AUTO_OPT_IN_TEAM_SLUG
    );
    if (!isMember) {
      return;
    }

    setUseNativeBinary(client, true);
  } catch (error) {
    output.debug(
      `Failed to auto-opt-in to the native binary: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
