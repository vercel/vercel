import type Client from '../client';
import getScope from '../get-scope';
import selectOrg from '../input/select-org';

/**
 * Resolves the team for Connex commands. Honors --scope, .vercel/project.json,
 * vercel.json scope, persisted currentTeam, and northstar defaultTeamId via
 * `getScope`. Falls back to an interactive picker only when no team context
 * is available, and persists the explicit pick to the global config.
 */
export async function selectConnexTeam(
  client: Client,
  message: string
): Promise<void> {
  const scope = await getScope(client, { resolveLocalScope: true });
  if (scope.org.type === 'team') {
    client.config.currentTeam = scope.org.id;
    return;
  }

  const org = await selectOrg(client, message, false);
  // Connex clients are team-owned; personal-scope selection is not supported.
  if (org.type !== 'team') {
    throw new Error(
      'Connex requires a team. Re-run and select a team to continue.'
    );
  }
  client.config.currentTeam = org.id;
  client.writeToConfigFile();
}
