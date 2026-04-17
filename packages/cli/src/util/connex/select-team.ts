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
  client.config.currentTeam = org.type === 'team' ? org.id : undefined;
}
