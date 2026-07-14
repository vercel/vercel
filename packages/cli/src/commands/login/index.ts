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
import { AGENT_ACTION, AGENT_STATUS } from '../../util/agent-output-constants';

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

  const passcodeFlag = parsedArgs?.flags['--passcode'];
  const passcode = typeof passcodeFlag === 'string' ? passcodeFlag : undefined;

  if (client.nonInteractive && !passcode) {
    const message =
      "Visit https://vercel.com/login/generate to generate a login passcode, then run 'vc login --passcode <passcode>'";
    client.stdout.write(`${message}\n`);
    outputActionRequired(client, {
      status: AGENT_STATUS.ACTION_REQUIRED,
      action: AGENT_ACTION.LOGIN_PASSCODE_REQUIRED,
      message,
      verification_uri: 'https://vercel.com/login/generate',
      next: [{ command: 'vc login --passcode <passcode>' }],
    });
    return 1;
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
