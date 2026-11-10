import type Client from '../client';
import getUser from '../get-user';
import output from '../../output-manager';

// NOTE: `client.authConfig.token` must be set before calling this
export async function updateCurrentTeamAfterLogin(
  client: Client,
  ssoTeamId?: string
) {
  // `updateConfig` also updates the saved team, so a login run by an agent
  // still saves the new team for the human.
  if (ssoTeamId) {
    client.updateConfig({ currentTeam: ssoTeamId });
  } else {
    let user = null;
    try {
      user = await getUser(client);
    } catch (_err: unknown) {
      // Shouldn't happen since we just logged in
      output.error('Failed to fetch the logged in user. Please try again.');
      return 1;
    }

    client.updateConfig({
      currentTeam:
        user.version === 'northstar' && user.defaultTeamId
          ? user.defaultTeamId
          : undefined,
    });
  }
}
