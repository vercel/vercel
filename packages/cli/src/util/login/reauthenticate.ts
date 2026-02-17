import { bold } from 'chalk';
import type { LoginResult, SAMLError } from './types';
import type Client from '../client';
import output from '../../output-manager';
import { performDeviceCodeFlow } from '../../commands/login/future';

export default async function reauthenticate(
  client: Client,
  error: Pick<SAMLError, 'enforced' | 'scope' | 'teamId'>
): Promise<LoginResult> {
  if (error.teamId && error.enforced) {
    output.log(
      `You must re-authenticate with SAML to use ${bold(error.scope)} scope.`
    );
  } else {
    output.log(`You must re-authenticate to use ${bold(error.scope)} scope.`);
  }

  // Use the device code flow for all re-authentication cases.
  // When the team has a missing scope, pass the team ID so the
  // device flow page can require SAML before granting the token.
  const tokens = await performDeviceCodeFlow(client, {
    teamId: error.teamId || undefined,
  });

  if (!tokens) {
    return 1;
  }

  client.updateAuthConfig({
    token: tokens.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + tokens.expires_in,
    refreshToken: tokens.refresh_token,
  });

  client.writeToAuthConfigFile();

  output.success(`Authentication complete for ${bold(error.scope)} scope.`);

  return { token: tokens.access_token, email: '' };
}
