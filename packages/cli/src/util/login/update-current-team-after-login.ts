import type Client from '../client.js';
import type { Output } from '../output/index.js';
import getUser from '../get-user.js';

// NOTE: `client.authConfig.token` must be set before calling this
export async function updateCurrentTeamAfterLogin(
  client: Client,
  output: Output,
  ssoTeamId?: string
) {
  if (ssoTeamId) {
    client.config.currentTeam = ssoTeamId;
  } else {
    let user = null;
    try {
      user = await getUser(client);
    } catch (err: unknown) {
      // Shouldn't happen since we just logged in
      output.error('Failed to fetch the logged in user. Please try again.');
      return 1;
    }

    if (user.version === 'northstar' && user.defaultTeamId) {
      client.config.currentTeam = user.defaultTeamId;
    } else {
      delete client.config.currentTeam;
    }
  }
}
