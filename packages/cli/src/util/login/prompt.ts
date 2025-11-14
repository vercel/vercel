import type Client from '../client';
import error from '../output/error';
import { getCommandName } from '../pkg-name';
import type { SAMLError } from './types';
import doSamlLogin from './saml';
import output from '../../output-manager';
import login from '../../commands/login';

export default async function prompt(
  client: Client,
  error?: Pick<SAMLError, 'teamId' | 'scope'>,
  ssoUserId?: string
) {
  if (error) {
    const slug =
      error?.scope ||
      error?.teamId ||
      (await readInput(client, 'Enter your Team slug:'));
    return await doSamlLogin(client, slug, ssoUserId);
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
