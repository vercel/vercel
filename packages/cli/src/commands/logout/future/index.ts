import { errorToString } from '@vercel/error-utils';
import type Client from '../../../util/client';
import {
  writeToAuthConfigFile,
  writeToConfigFile,
} from '../../../util/config/files';
import { parseArguments } from '../../../util/get-args';
import { getFlagsSpecification } from '../../../util/get-flags-specification';
import { printError } from '../../../util/error';
import { getCommandName } from '../../../util/pkg-name';
import { help } from '../../help';
import { logoutCommand } from './command';
import {
  revocationRequest,
  processRevocationResponse,
} from '../../../util/oauth';
import o from '../../../output-manager';
import { LogoutTelemetryClient } from '../../../util/telemetry/commands/logout';

export async function logout(client: Client): Promise<number> {
  const { config, authConfig } = client;

  const flagsSpecification = getFlagsSpecification(logoutCommand.options);

  const telemetry = new LogoutTelemetryClient({
    opts: { store: client.telemetryEventStore },
  });

  let parsedArgs = null;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('logout --future');
    o.print(help(logoutCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (!authConfig.token) {
    o.note(
      `Not currently logged in, so ${getCommandName('logout --future')} did nothing`
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

  delete config.currentTeam;

  // The new user might have completely different teams, so
  // we should wipe the order.
  if (config.desktop) delete config.desktop.teamOrder;

  delete authConfig.token;

  try {
    writeToConfigFile(config);
    writeToAuthConfigFile(authConfig);
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
