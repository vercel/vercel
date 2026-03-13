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
import { outputActionRequired } from '../../util/agent-output';
import { getCommandNamePlain, packageName } from '../../util/pkg-name';
import { getGlobalFlagsOnlyFromArgs } from '../../util/arg-common';

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

  // Non-interactive mode: don't start an interactive device-code flow.
  // Passcode-based login is not yet available; the user must run login interactively.
  if (
    client.nonInteractive &&
    options.shouldParseArgs &&
    parsedArgs &&
    parsedArgs.args.slice(1).length === 0
  ) {
    const loginCmd = `${packageName} login`;
    const message = `You must run the following command to log in: \`${loginCmd}\`. Run it without --non-interactive to complete sign-in in your browser.`;

    // Plain text for humans (stdout/stderr via output manager)
    output.print(`${message}\n`);

    // Structured payload for agents
    outputActionRequired(
      client,
      {
        status: 'action_required',
        reason: 'login_required',
        action: 'login_required',
        message,
        hint: `Run this command to log in: ${loginCmd}`,
        verification_uri: 'https://vercel.com/login',
        next: [{ command: loginCmd, when: 'to log in' }],
      },
      1
    );
  }

  telemetry.trackState('started');

  // Device flow requires a user to visit vercel.com/device; non-interactive mode
  // would hang polling forever—emit structured payload and exit.
  if (client.nonInteractive) {
    const globalFlags = getGlobalFlagsOnlyFromArgs(
      client.argv.slice(2).filter(a => a !== '--non-interactive')
    );
    const loginTtyCmd = getCommandNamePlain(
      `login ${globalFlags.join(' ')}`.trim()
    );
    outputActionRequired(
      client,
      {
        status: 'action_required',
        reason: 'login_requires_user_action',
        userActionRequired: true,
        message:
          'Login uses a device flow: a user must open the verification URL and approve in the browser. This cannot complete in non-interactive mode. Run login in a TTY without --non-interactive; credentials are stored globally afterward so agents can rerun commands without any secret on the command line.',
        next: [
          {
            command: loginTtyCmd,
            when: 'run in a terminal with TTY (omit --non-interactive) so the user can complete device auth',
          },
        ],
        hint: 'Do not run vercel login --non-interactive—it will hang. Avoid passing tokens via CLI where agents can read them; prefer one-time TTY login so the CLI reads auth from global config on later runs.',
      },
      1
    );
  }

  return await future(client, telemetry);
}
