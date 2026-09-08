import ciInfo from 'ci-info';
import login from '../../commands/login';
import output from '../../output-manager';
import type Client from '../client';
import getGlobalPathConfig from '../config/global-path';
import { printError } from '../error';
import hp from '../humanize-path';
import param from '../output/param';
import { getCommandName } from '../pkg-name';

export default async function promptMissingCredentials(
  client: Client,
  onLoginError?: (error: unknown) => void
): Promise<number> {
  const isTTY = process.stdout.isTTY;
  if (!ciInfo.isCI && (isTTY || client.isAgent)) {
    output.log(
      isTTY
        ? 'No existing credentials found. Please log in:'
        : 'No existing credentials found. Starting login flow...'
    );
    try {
      const result = await login(client, { shouldParseArgs: false });
      if (result !== 0) {
        return result;
      }
    } catch (error) {
      printError(error);
      onLoginError?.(error);
      return 1;
    }
    output.debug(`Saved credentials in "${hp(getGlobalPathConfig())}"`);
    return 0;
  }
  output.prettyError({
    message:
      'No existing credentials found. Please run ' +
      `${getCommandName('login')} or pass ${param('--token')}`,
    link: 'https://err.sh/vercel/no-credentials-found',
  });
  return 1;
}
