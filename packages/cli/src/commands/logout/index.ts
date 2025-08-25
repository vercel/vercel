import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { help } from '../help';
import { logoutCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { LogoutTelemetryClient } from '../../util/telemetry/commands/logout';
import chalk from 'chalk';
import { errorToString } from '@vercel/error-utils';
import { getCommandName } from '../../util/pkg-name';
import { revocationRequest, processRevocationResponse } from '../../util/oauth';

export default async function logout(client: Client): Promise<number> {
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

  function filterDeprecated(flag: string) {
    const option =
      logoutCommand.options[flag as keyof typeof logoutCommand.options];
    if (typeof option === 'number') return;
    return 'deprecated' in option && option.deprecated;
  }
  const obsoleteFlags = Object.keys(parsedArgs.flags).filter(filterDeprecated);

  if (obsoleteFlags.length) {
    const flags = obsoleteFlags.map(f => chalk.bold(f)).join(', ');
    output.warn(`The following flags are deprecated: ${flags}`);
  }

  const obsoleteArguments = parsedArgs.args.slice(1);
  if (obsoleteArguments.length) {
    const args = obsoleteArguments.map(a => chalk.bold(a)).join(', ');
    output.warn(`The following arguments are deprecated: ${args}`);
  }

  if (obsoleteArguments.length || obsoleteFlags.length) {
    output.print(
      // TODO: fix link
      `Read more in our ${output.link('changelog', 'https://vercel.com/changelog')}.\n`
    );
  }

  const { authConfig } = client;

  if (!authConfig.token) {
    output.note(
      `Not currently logged in, so ${getCommandName('logout')} did nothing`
    );
    return 0;
  }

  output.spinner('Logging out…', 200);

  const revocationResponse = await revocationRequest({
    token: authConfig.token,
  });

  output.debug(
    `'Revocation response:', ${await revocationResponse.clone().text()}`
  );

  const [revocationError] = await processRevocationResponse(revocationResponse);
  let logoutError = false;
  if (revocationError) {
    output.error(revocationError.message);
    output.debug(revocationError.cause);
    output.error('Failed during logout');
    logoutError = true;
  }

  try {
    client.updateConfig({ currentTeam: undefined });
    client.writeToConfigFile();

    client.emptyAuthConfig();
    client.writeToAuthConfigFile();
    output.debug('Configuration has been deleted');

    if (!logoutError) {
      output.success('Logged out!');
      return 0;
    }
  } catch (err: unknown) {
    output.debug(errorToString(err));
    output.error('Failed during logout');
  }
  return 1;
}
