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

export async function future(client: Client): Promise<number> {
  const { config, authConfig } = client;

  o.warn('This feature is under active development. Do not use!');

  const flagsSpecification = getFlagsSpecification(logoutCommand.options);

  let parsedArgs = null;
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    o.print(help(logoutCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (!authConfig.token) {
    o.note(
      `Not currently logged in, so ${getCommandName('logout')} did nothing`
    );
    return 0;
  }

  o.spinner('Logging out…', 200);

  const revocationResponse = await revocationRequest({
    token: authConfig.token,
  });

  o.debug(`'Revocation response:', ${await revocationResponse.clone().text()}`);

  const [revocationError] = await processRevocationResponse(revocationResponse);

  if (revocationError) {
    printError(revocationError);
    return 1;
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
  } catch (err: unknown) {
    o.debug(errorToString(err));
    o.error('Failed during logout');
    return 1;
  }

  o.success('Logged out!');
  return 0;
}
