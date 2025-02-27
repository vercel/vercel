import { validate as validateEmail } from 'email-validator';
import chalk from 'chalk';
import hp from '../../util/humanize-path';
import { parseArguments } from '../../util/get-args';
import prompt from '../../util/login/prompt';
import doSamlLogin from '../../util/login/saml';
import doEmailLogin from '../../util/login/email';
import doGithubLogin from '../../util/login/github';
import doGitlabLogin from '../../util/login/gitlab';
import doBitbucketLogin from '../../util/login/bitbucket';
import { prependEmoji, emoji } from '../../util/emoji';
import { getCommandName } from '../../util/pkg-name';
import getGlobalPathConfig from '../../util/config/global-path';
import {
  writeToAuthConfigFile,
  writeToConfigFile,
} from '../../util/config/files';
import type Client from '../../util/client';
import type { LoginResult } from '../../util/login/types';
import { help } from '../help';
import { loginCommand } from './command';
import { updateCurrentTeamAfterLogin } from '../../util/login/update-current-team-after-login';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import { printError } from '../../util/error';
import output from '../../output-manager';
import { LoginTelemetryClient } from '../../util/telemetry/commands/login';
import { login as future } from './future';

export default async function login(client: Client): Promise<number> {
  // user is not currently authenticated on this machine
  const isInitialLogin = !client.authConfig.token;

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

  if (parsedArgs.flags['--future']) {
    return await future(client);
  }

  if (parsedArgs.flags['--help']) {
    telemetry.trackCliFlagHelp('login');
    output.print(help(loginCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (parsedArgs.flags['--token']) {
    output.error('`--token` may not be used with the "login" command');
    return 2;
  }

  const input = parsedArgs.args[1];

  let result: LoginResult = 1;

  if (input) {
    // Email or Team slug was provided via command line
    if (validateEmail(input)) {
      result = await doEmailLogin(client, input);
    } else {
      result = await doSamlLogin(client, input, parsedArgs.flags['--oob']);
    }
  } else if (parsedArgs.flags['--github']) {
    result = await doGithubLogin(client, parsedArgs.flags['--oob']);
  } else if (parsedArgs.flags['--gitlab']) {
    result = await doGitlabLogin(client, parsedArgs.flags['--oob']);
  } else if (parsedArgs.flags['--bitbucket']) {
    result = await doBitbucketLogin(client, parsedArgs.flags['--oob']);
  } else {
    // Interactive mode
    result = await prompt(client, undefined, parsedArgs.flags['--oob']);
  }

  // The login function failed, so it returned an exit code
  if (typeof result === 'number') {
    return result;
  }

  // Save the user's authentication token to the configuration file.
  client.authConfig.token = result.token;

  if (result.teamId) {
    client.config.currentTeam = result.teamId;
  } else {
    delete client.config.currentTeam;
  }

  // If we have a brand new login, update `currentTeam`
  if (isInitialLogin) {
    await updateCurrentTeamAfterLogin(client, client.config.currentTeam);
  }

  writeToAuthConfigFile(client.authConfig);
  writeToConfigFile(client.config);

  output.debug(`Saved credentials in "${hp(getGlobalPathConfig())}"`);

  output.print(
    `${chalk.cyan('Congratulations!')} ` +
      `You are now logged in. In order to deploy something, run ${getCommandName()}.\n`
  );

  output.print(
    `${prependEmoji(
      `Connect your Git Repositories to deploy every branch push automatically (https://vercel.link/git).`,
      emoji('tip')
    )}\n`
  );

  return 0;
}
