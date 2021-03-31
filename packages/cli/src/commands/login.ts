import inquirer from 'inquirer';
import { validate as validateEmail } from 'email-validator';
import chalk from 'chalk';
import hp from '../util/humanize-path';
import getArgs from '../util/get-args';
import error from '../util/output/error';
import handleError from '../util/handle-error';
import logo from '../util/output/logo';
import doSsoLogin from '../util/login/sso';
import doEmailLogin from '../util/login/email';
import { prependEmoji, emoji } from '../util/emoji';
import { getCommandName, getPkgName } from '../util/pkg-name';
import getGlobalPathConfig from '../util/config/global-path';
import { writeToAuthConfigFile, writeToConfigFile } from '../util/config/files';
import Client from '../util/client';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} login`)} <email or team>

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Log into the Vercel platform

    ${chalk.cyan(`$ ${getPkgName()} login`)}

  ${chalk.gray('–')} Log in using a specific email address

    ${chalk.cyan(`$ ${getPkgName()} login john@doe.com`)}

  ${chalk.gray('–')} Log in using a specific team "slug" for SAML Single Sign-On

    ${chalk.cyan(`$ ${getPkgName()} login acme`)}
`);
};

const readInput = async () => {
  let input;

  while (!input) {
    try {
      const { val } = await inquirer.prompt({
        type: 'input',
        name: 'val',
        message: 'Enter your email or team slug:',
      });
      input = val;
    } catch (err) {
      console.log(); // \n

      if (err.isTtyError) {
        throw new Error(
          error(
            `Interactive mode not supported – please run ${getCommandName(
              `login you@domain.com`
            )}`
          )
        );
      }
    }
  }

  return input;
};

export default async function login(client: Client): Promise<number> {
  let argv;
  const { apiUrl, output } = client;

  try {
    argv = getArgs(client.argv.slice(2));
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  if (argv['--token']) {
    output.error('`--token` may not be used with the "login" command');
    return 2;
  }

  const input = argv._[1] || (await readInput());

  // TODO: add proper validation
  const isValidSlug = true;

  let result: number | string = 1;

  if (validateEmail(input)) {
    result = await doEmailLogin(input, { output, apiUrl });
  } else if (isValidSlug) {
    result = await doSsoLogin(input, { output, apiUrl });
  } else {
    output.error(`Invalid input: "${input}"`);
    output.log(`Please enter a valid email address or team slug`);
    return 2;
  }

  // The login function failed, so it returned an exit code
  if (typeof result === 'number') {
    return result;
  }

  // When `result` is a string it's the user's authentication token.
  // It needs to be saved to the configuration file.
  client.authConfig.token = result;

  // New user, so we can't keep the team
  delete client.config.currentTeam;

  writeToAuthConfigFile(client.authConfig);
  writeToConfigFile(client.config);

  output.debug(`Saved credentials in "${hp(getGlobalPathConfig())}"`);

  console.log(
    `${chalk.cyan('Congratulations!')} ` +
      `You are now logged in. In order to deploy something, run ${getCommandName()}.`
  );

  output.print(
    `${prependEmoji(
      `Connect your Git Repositories to deploy every branch push automatically (https://vercel.link/git).`,
      emoji('tip')
    )}\n`
  );

  return 0;
}
