import chalk from 'chalk';
import { parseArguments } from '../../util/get-args';
import type Client from '../../util/client';
import { help } from '../help';
import { signupCommand } from './command';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import { getCommandName } from '../../util/pkg-name';
import { emoji } from '../../util/emoji';
import { email as regexEmail } from '../../util/input/regexes';
import output from '../../output-manager';
import { SignupTelemetryClient } from '../../util/telemetry/commands/signup';
import { performDeviceCodeFlow, saveDeviceCodeTokens } from '../login/future';
import {
  shouldEmitNonInteractiveCommandError,
  writeAgentError,
} from '../../util/agent-output';
import { AGENT_REASON, AGENT_STATUS } from '../../util/agent-output-constants';

function isValidEmail(value: string): boolean {
  return regexEmail.test(value.trim());
}

export default async function signup(client: Client): Promise<number> {
  const telemetry = new SignupTelemetryClient({
    opts: {
      store: client.telemetryEventStore,
    },
  });

  let parsedArgs;
  try {
    parsedArgs = parseArguments(
      client.argv.slice(2),
      getFlagsSpecification(signupCommand.options)
    );
  } catch (error) {
    printError(error, client);
    return 2;
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('signup');
    output.print(
      help(signupCommand, {
        stream: client.stderr,
        columns: client.stderr.columns,
      })
    );
    return 0;
  }

  if (parsedArgs.flags['--token']) {
    output.error('`--token` may not be used with the "signup" command');
    return 2;
  }

  const extraArgs = parsedArgs.args.slice(1);

  if (extraArgs.length) {
    output.error(
      `Too many arguments. Usage: ${getCommandName('signup --email user@example.com')}`
    );
    return 2;
  }

  const emailOption = parsedArgs.flags['--email'];
  telemetry.trackCliOptionEmail(emailOption);

  let email = emailOption?.trim();

  if (email && !isValidEmail(email)) {
    if (shouldEmitNonInteractiveCommandError(client)) {
      writeAgentError(client, {
        status: AGENT_STATUS.ERROR,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
        message: 'The value provided for --email is not a valid email address.',
      });
    }
    output.error(
      `Couldn't use ${chalk.bold(email)}: not a valid email address.`
    );
    return 2;
  }

  const canPrompt =
    client.stdin.isTTY === true && !client.nonInteractive && !client.isAgent;

  if (!email) {
    if (!canPrompt) {
      if (shouldEmitNonInteractiveCommandError(client)) {
        writeAgentError(client, {
          status: AGENT_STATUS.ERROR,
          reason: AGENT_REASON.MISSING_ARGUMENTS,
          message: 'Provide an email address with --email.',
        });
      }
      output.error(
        `Provide an email address with ${chalk.bold('--email')}. Example: ${getCommandName('signup --email user@example.com')}`
      );
      return 2;
    }

    email = await client.input.text({
      message: 'Email?',
      validate: value =>
        isValidEmail(value) ? true : 'Enter a valid email address.',
    });
    email = email.trim();
  }

  telemetry.trackState('started');

  try {
    const tokens = await performDeviceCodeFlow(client, {
      signupEmail: email,
    });

    if (!tokens) {
      telemetry.trackState('error');
      return 1;
    }

    await saveDeviceCodeTokens(client, tokens);
  } catch (error) {
    telemetry.trackState('error');
    printError(error);
    return 1;
  }

  output.print(`
  ${chalk.cyan('Welcome to Vercel!')} Your account is ready and you are signed in.

  Run ${getCommandName('deploy')} to deploy, or ${getCommandName('setup')} to set up the Vercel plugin and connect your coding agents to AI Gateway.

  ${emoji('tip')} To deploy every commit automatically,
  connect a Git Repository (${chalk.bold(output.link('vercel.link/git', 'https://vercel.link/git', { color: false }))}).\n`);

  telemetry.trackState('success');

  return 0;
}
