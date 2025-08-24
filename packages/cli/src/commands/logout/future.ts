import { errorToString } from '@vercel/error-utils';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { revocationRequest, processRevocationResponse } from '../../util/oauth';
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

  const revocationResponse = await revocationRequest({
    token: authConfig.token,
  });

  o.debug(`'Revocation response:', ${await revocationResponse.clone().text()}`);

  const [revocationError] = await processRevocationResponse(revocationResponse);
  let logoutError = false;
  if (revocationError) {
    o.error(revocationError.message);
    o.debug(revocationError.cause);
    o.error('Failed during logout');
    logoutError = true;
  }

  try {
    client.updateConfig({ currentTeam: undefined });
    client.writeToConfigFile();

    client.emptyAuthConfig();
    client.writeToAuthConfigFile();
    o.debug('Configuration has been deleted');

    if (!logoutError) {
      o.success('Logged out!');
      return 0;
    }
  } catch (err: unknown) {
    o.debug(errorToString(err));
    o.error('Failed during logout');
  }
  return 1;
}
