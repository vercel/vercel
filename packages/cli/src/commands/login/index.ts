import chalk from 'chalk';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { help } from '../help';
import { loginCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { LoginTelemetryClient } from '../../util/telemetry/commands/login';
import { login as future } from './future';
import { outputCommandSchema } from '../../util/describe-command';
import { outputDryRun } from '../../util/dry-run';

export default async function login(
  client: Client,
  options: {
    /**
     * In addition to `vercel login`, this command is also called inline in some cases, to trigger
     * re-authentication flows. In those cases, we don't want to parse the args.
     */
    shouldParseArgs: boolean;
  }
): Promise<number> {
  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(loginCommand.options);

  const telemetry = new LoginTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  // Parse CLI args
  try {
    if (options.shouldParseArgs) {
      parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
    }
  } catch (error) {
    printError(error);
    return 1;
  }

  if (parsedArgs?.flags['--help']) {
    telemetry.trackCliFlagHelp('login');
    output.print(help(loginCommand, { columns: client.stderr.columns }));
    return 0;
  }

  if (parsedArgs?.flags['--describe']) {
    outputCommandSchema(client, loginCommand);
    return 0;
  }

  if (parsedArgs?.flags['--dry-run']) {
    return outputDryRun(client, {
      status: 'dry_run',
      reason: 'dry_run_ok',
      message: 'Login would initiate OAuth device code flow',
      actions: [
        {
          action: 'api_call',
          description: 'POST device authorization request to Vercel OAuth',
        },
        {
          action: 'browser_open',
          description: 'Open verification URL in browser',
        },
        { action: 'poll', description: 'Poll for token completion' },
        {
          action: 'file_write',
          description: 'Save credentials',
          details: { path: '~/.vercel/auth.json' },
        },
      ],
    });
  }

  if (parsedArgs?.flags['--token']) {
    output.error('`--token` may not be used with the "login" command');
    return 2;
  }

  if (options.shouldParseArgs && parsedArgs) {
    const obsoleteFlags = Object.keys(parsedArgs.flags).filter(flag => {
      const flagKey = flag.replace('--', '');
      const option = loginCommand.options.find(o => o.name === flagKey);
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
  }

  telemetry.trackState('started');

  return await future(client, telemetry);
}
