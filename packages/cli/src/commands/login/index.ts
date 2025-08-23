import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { help } from '../help';
import { loginCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { LoginTelemetryClient } from '../../util/telemetry/commands/login';
import { login as future } from './future';
import chalk from 'chalk';

export default async function login(client: Client): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(loginCommand.options);

  const telemetry = new LoginTelemetryClient({
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
    telemetry.trackCliFlagHelp('login');
    output.print(help(loginCommand, { columns: client.stderr.columns }));
    return 0;
  }

  if (parsedArgs.flags['--token']) {
    output.error('`--token` may not be used with the "login" command');
    return 2;
  }

  const obsoleteFlags = Object.keys(parsedArgs.flags);

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

  telemetry.trackCliFlagFuture('login');
  return await future(client);
}
