import { errorToString } from '@vercel/error-utils';
import output from '../../output-manager';
import type Client from '../../util/client';
import {
  writeToAuthConfigFile,
  writeToConfigFile,
} from '../../util/config/files';
import { printError } from '../../util/error';
import { isAPIError } from '../../util/errors-ts';
import { parseArguments } from '../../util/get-args';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { getCommandName } from '../../util/pkg-name';
import { LogoutTelemetryClient } from '../../util/telemetry/commands/logout';
import { help } from '../help';
import { logoutCommand } from './command';
import { logout as future } from './future';

export default async function logout(client: Client): Promise<number> {
  const { authConfig, config } = client;

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(logoutCommand.options);

  const telemetry = new LogoutTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('logout');
    output.print(help(logoutCommand, { columns: client.stderr.columns }));
    return 0;
  }

  // Unless the authConfig has a refreshToken, fall back to legacy logout
  if ('refreshToken' in authConfig) {
    return await future(client);
  }

  output.debug('Falling back to legacy logout');

  if (!authConfig.token) {
    output.note(
      `Not currently logged in, so ${getCommandName('logout')} did nothing`
    );
    return 0;
  }

  output.spinner('Logging out…', 200);
  let exitCode = 0;

  try {
    await client.fetch('/v3/user/tokens/current', {
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
    output.error('Failed during logout');
  }

  return exitCode;
}
