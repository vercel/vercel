import login from '../../commands/login';
import output from '../../output-manager';
import type Client from '../client';
import { oauth } from '../oauth';
import { reauthorizeTeam } from '@vercel/cli-auth/sso';
import { bold } from 'chalk';
import type { LoginResult, SAMLError } from './types';
import error from '../output/error';
import { getCommandName } from '../pkg-name';

export default async function doSamlLogin(
  client: Client,
  teamIdOrSlug: string
) {
  if (!client.authConfig.refreshToken) {
    output.log('Token is outdated, please log in again.');
    const exitCode = await login(client, { shouldParseArgs: false });
    if (exitCode !== 0) return exitCode;
  }

  await reauthorizeTeam({
    team: teamIdOrSlug,
    token: client.authConfig.token,
    oauth: await oauth.init(),
  });

  return 0;
}

export async function reauthenticate(
  client: Client,
  error: Pick<SAMLError, 'enforced' | 'scope' | 'teamId'>
): Promise<LoginResult> {
  if (error.teamId && error.enforced) {
    // If team has SAML enforced then trigger the SSO login directly
    output.log(
      `You must re-authenticate with SAML to use ${bold(error.scope)} scope.`
    );
    if (await client.input.confirm(`Log in with SAML?`, true)) {
      return doSamlLogin(client, error.scope ?? error.teamId);
    }
  } else {
    // Personal account, or team that does not have SAML enforced
    output.log(`You must re-authenticate to use ${bold(error.scope)} scope.`);
    return showLoginPrompt(client, error);
  }
  return 1;
}

async function showLoginPrompt(
  client: Client,
  error?: Pick<SAMLError, 'teamId' | 'scope'>
) {
  if (error) {
    const slug =
      error?.scope ||
      error?.teamId ||
      (await readInput(client, 'Enter your Team slug:'));
    return await doSamlLogin(client, slug);
  }

  return await login(client, { shouldParseArgs: false });
}

async function readInput(client: Client, message: string): Promise<string> {
  let input;

  while (!input) {
    try {
      input = await client.input.text({ message });
    } catch (err: any) {
      output.print('\n'); // \n

      if (err.isTtyError) {
        throw new Error(
          error(
            `Interactive mode not supported – please run ${getCommandName(
              `login you@domain.com`
            )}`
          )
        );
      }
    }
  }

  return input;
}
