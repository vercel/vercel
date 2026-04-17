import type Client from '../client';
import selectOrg from '../input/select-org';

/**
 * Resolves the team for Connex commands. Skips the interactive prompt
 * if a team is already set (via --scope, vercel switch, or defaultTeamId).
 * Prompts the user to pick a team otherwise.
 */
export async function selectConnexTeam(
  client: Client,
  message: string
): Promise<void> {
  const hasTeam = Boolean(client.config.currentTeam);
  const org = await selectOrg(client, message, hasTeam);
  // Connex clients are team-owned; personal-scope selection is not supported.
  if (org.type !== 'team') {
    throw new Error(
      'Connex requires a team. Re-run and select a team to continue.'
    );
  }
  client.config.currentTeam = org.id;
  if (!hasTeam) {
    client.writeToConfigFile();
  }
}
