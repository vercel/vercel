import chalk from 'chalk';
import { printError } from '../../util/error';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { help } from '../help';
import { logoutCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import output from '../../output-manager';
import { LogoutTelemetryClient } from '../../util/telemetry/commands/logout';
import { logout as future } from './future';

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

  const obsoleteFlags = Object.keys(parsedArgs.flags).filter(flag => {
    const flagKey = flag.replace('--', '');
    const option = logoutCommand.options.find(o => o.name === flagKey);
    if (!option || typeof option === 'number') return;
    return 'deprecated' in option && option.deprecated;
  });

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
      `Read more in our ${output.link('changelog', 'https://vercel.com/changelog/new-vercel-cli-login-flow')}.\n`
    );
  }

  return await future(client);
}
