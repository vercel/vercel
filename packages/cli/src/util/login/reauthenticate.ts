import { bold } from 'chalk';
import doSamlLogin from './saml';
import showLoginPrompt from './prompt';
import type { LoginResult, SAMLError } from './types';
import type Client from '../client';
import output from '../../output-manager';

export default async function reauthenticate(
  client: Client,
  error: Pick<SAMLError, 'enforced' | 'scope' | 'teamId'>
): Promise<LoginResult> {
  if (error.teamId && error.enforced) {
    // If team has SAML enforced then trigger the SSO login directly
    output.log(
      `You must re-authenticate with SAML to use ${bold(error.scope)} scope.`
    );
    if (await client.input.confirm(`Log in with SAML?`, true)) {
      return doSamlLogin(client, error.teamId);
    }
  } else {
    // Personal account, or team that does not have SAML enforced
    output.log(`You must re-authenticate to use ${bold(error.scope)} scope.`);
    return showLoginPrompt(client, error);
  }
  return 1;
}
