import chalk from 'chalk';
import hp from '../../util/humanize-path';
import { parseArguments } from '../../util/get-args';
import { prependEmoji, emoji } from '../../util/emoji';
import { getCommandName } from '../../util/pkg-name';
import getGlobalPathConfig from '../../util/config/global-path';
import {
  writeToAuthConfigFile,
  writeToConfigFile,
} from '../../util/config/files';
import Client from '../../util/client';
import { LoginResult } from '../../util/login/types';
import { help } from '../help';
import { loginCommand } from './command';
import { updateCurrentTeamAfterLogin } from '../../util/login/update-current-team-after-login';
import { getFlagsSpecification } from '../../util/get-flags-specification';
import handleError from '../../util/handle-error';
import doOauthLogin from '../../util/login/oauth';

export default async function login(client: Client): Promise<number> {
  const { output } = client;

  // user is not currently authenticated on this machine
  const isInitialLogin = !client.authConfig.token;

  let parsedArgs = null;

  const flagsSpecification = getFlagsSpecification(loginCommand.options);

  // Parse CLI args
  try {
    parsedArgs = parseArguments(client.argv.slice(2), flagsSpecification);
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (parsedArgs.flags['--help']) {
    output.print(help(loginCommand, { columns: client.stderr.columns }));
    return 2;
  }

  if (parsedArgs.flags['--token']) {
    output.error('`--token` may not be used with the "login" command');
    return 2;
  }

  let result: LoginResult = 1;

  const url = new URL('/login', 'https://vercel.com');
  url.searchParams.set('cli', '1');
  result = await doOauthLogin(
    client,
    url,
    'SAML Single Sign-On',
    parsedArgs.flags['--oob']
  );

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
    await updateCurrentTeamAfterLogin(
      client,
      output,
      client.config.currentTeam
    );
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
