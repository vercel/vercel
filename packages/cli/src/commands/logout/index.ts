import { handleError } from '../../util/error.js';
import {
  writeToConfigFile,
  writeToAuthConfigFile,
} from '../../util/config/files.js';
import getArgs from '../../util/get-args.js';
import Client from '../../util/client.js';
import { getCommandName } from '../../util/pkg-name.js';
import { isAPIError } from '../../util/errors-ts.js';
import { errorToString } from '@vercel/error-utils';
import { help } from '../help.js';
import { logoutCommand } from './command.js';

export default async function main(client: Client): Promise<number> {
  let argv;
  const { authConfig, config, output } = client;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--help': Boolean,
      '-h': '--help',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    output.print(help(logoutCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (!authConfig.token) {
    output.note(
      `Not currently logged in, so ${getCommandName('logout')} did nothing`
    );
    return 0;
  }

  output.spinner('Logging out…', 200);
  let exitCode = 0;

  try {
    await client.fetch(`/v3/user/tokens/current`, {
      method: 'DELETE',
      useCurrentTeam: false,
    });
  } catch (err: unknown) {
    if (isAPIError(err)) {
      if (err.status === 403) {
        output.debug('Token is invalid so it cannot be revoked');
      } else if (err.status !== 200) {
        output.debug(err?.message ?? '');
        exitCode = 1;
      }
    }
  }

  delete config.currentTeam;

  // The new user might have completely different teams, so
  // we should wipe the order.
  if (config.desktop) {
    delete config.desktop.teamOrder;
  }

  delete authConfig.token;

  try {
    writeToConfigFile(config);
    writeToAuthConfigFile(authConfig);
    output.debug('Configuration has been deleted');
  } catch (err: unknown) {
    output.debug(errorToString(err));
    exitCode = 1;
  }

  if (exitCode === 0) {
    output.log('Logged out!');
  } else {
    output.error(`Failed during logout`);
  }

  return exitCode;
}
