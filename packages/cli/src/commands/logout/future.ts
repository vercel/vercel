import { errorToString } from '@vercel/error-utils';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { isOAuthError, oauth } from '../../util/oauth';
import output from '../../output-manager';

export async function logout(client: Client): Promise<number> {
  const { authConfig } = client;

  if (!authConfig.token) {
    output.note(
      `Not currently logged in, so ${getCommandName('logout')} did nothing`
    );
    return 0;
  }

  const oauthClient = await oauth.init();

  output.spinner('Logging out…', 200);

  const revocationResponse = await oauthClient.revokeToken(authConfig.token);

  let logoutError = false;
  if (isOAuthError(revocationResponse)) {
    output.debug(`'Revocation response:', ${revocationResponse.message}`);
    output.error(revocationResponse.message);
    output.debug(revocationResponse.cause);
    output.error('Failed during logout');
    logoutError = true;
  }

  try {
    client.updateConfig({ currentTeam: undefined });
    client.writeToConfigFile();

    client.emptyAuthConfig();
    client.writeToAuthConfigFile();
    output.debug('Configuration has been deleted');

    if (!logoutError) {
      output.success('Logged out!');
      return 0;
    }
  } catch (err: unknown) {
    output.debug(errorToString(err));
    output.error('Failed during logout');
  }
  return 1;
}
