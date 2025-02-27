import { printError } from '../../util/error';
import {
  writeToConfigFile,
  writeToAuthConfigFile,
} from '../../util/config/files';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { getCommandName } from '../../util/pkg-name';
import { isAPIError } from '../../util/errors-ts';
import { errorToString } from '@vercel/error-utils';
import { help } from '../help';
import { logoutCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { LogoutTelemetryClient } from '../../util/telemetry/commands/logout';
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

  if (parsedArgs.flags['--future']) {
    return await future(client);
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('logout');
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
    output.error('Failed during logout');
  }

  return exitCode;
}
