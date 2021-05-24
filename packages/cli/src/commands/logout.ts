import chalk from 'chalk';
import logo from '../util/output/logo';
// @ts-ignore
import { handleError } from '../util/error';
import { writeToConfigFile, writeToAuthConfigFile } from '../util/config/files';
import getArgs from '../util/get-args';
import Client from '../util/client';
import { getCommandName, getPkgName } from '../util/pkg-name';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} logout`)}

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Logout from the CLI:

    ${chalk.cyan(`$ ${getPkgName()} logout`)}
`);
};

export default async function main(client: Client): Promise<number> {
  let argv;

  try {
    argv = getArgs(client.argv.slice(2), {
      '--help': Boolean,
      '-h': '--help',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const { authConfig, config, output } = client;

  if (!authConfig.token) {
    output.note(
      `Not currently logged in, so ${getCommandName('logout')} did nothing`
    );
    return 0;
  }

  output.spinner('Logging out…', 200);
  let exitCode = 0;

  try {
    await client.fetch(`/v3/user/tokens/current`, {
      method: 'DELETE',
    });
  } catch (err) {
    if (err.status === 403) {
      output.debug('Token is invalid so it cannot be revoked');
    } else if (err.status !== 200) {
      output.debug(err?.message ?? '');
      exitCode = 1;
    }
  }

  delete config.currentTeam;

  // The new user might have completely different teams, so
  // we should wipe the order.
  if (config.desktop) {
    delete config.desktop.teamOrder;
  }

  delete authConfig.token;

  try {
    writeToConfigFile(config);
    writeToAuthConfigFile(authConfig);
    output.debug('Configuration has been deleted');
  } catch (err) {
    output.debug(err?.message ?? '');
    exitCode = 1;
  }

  if (exitCode === 0) {
    output.log('Logged out!');
  } else {
    output.error(`Failed during logout`);
  }

  return exitCode;
}
