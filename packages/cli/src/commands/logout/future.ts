import { errorToString } from '@vercel/error-utils';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { isOAuthError, oauth } from '../../util/oauth';
import o from '../../output-manager';

export async function logout(client: Client): Promise<number> {
  const { authConfig } = client;

  if (!authConfig.token) {
    o.note(
      `Not currently logged in, so ${getCommandName('logout')} did nothing`
    );
    return 0;
  }

  o.spinner('Logging out…', 200);

  try {
    const oauthClient = await oauth.init();
    const revocationResponse = await oauthClient.revokeToken(authConfig.token);

    if (isOAuthError(revocationResponse)) {
      o.debug(`'Revocation response:', ${revocationResponse.message}`);
      o.error(revocationResponse.message);
      o.debug(revocationResponse.cause);
      throw revocationResponse;
    }
    client.updateConfig({ currentTeam: undefined });
    client.writeToConfigFile();

    client.emptyAuthConfig();
    client.writeToAuthConfigFile();
    o.debug('Configuration has been deleted');

    o.success('Logged out!');
    return 0;
  } catch (err: unknown) {
    if (!isOAuthError(err)) o.debug(errorToString(err));
    o.error('Failed during logout');
  }
  return 1;
}
