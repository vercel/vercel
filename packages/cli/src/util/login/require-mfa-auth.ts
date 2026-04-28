import type Client from '../client';
import output from '../../output-manager';
import getUser from '../get-user';
import { performDeviceCodeFlow } from '../../commands/login/future';

export async function requireMfaAuth(client: Client): Promise<true | number> {
  const user = await getUser(client);
  if (!user.mfa?.enabled) {
    output.error(
      'Two-factor authentication is required to run this command. Enable it at https://vercel.com/account/security and try again.'
    );
    return 1;
  }

  if (client.justAuthenticated) {
    return true;
  }

  output.log('Re-authentication required. Opening your browser...');
  const tokens = await performDeviceCodeFlow(client);
  if (!tokens) {
    output.error('Authentication was not completed.');
    return 1;
  }
  client.updateAuthConfig({
    token: tokens.access_token,
    userId: undefined,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    refreshToken: tokens.refresh_token,
  });
  client.writeToAuthConfigFile();
  client.justAuthenticated = true;

  return true;
}
