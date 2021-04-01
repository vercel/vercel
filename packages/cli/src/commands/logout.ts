import chalk from 'chalk';
import fetch from 'node-fetch';
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

  const { authConfig, config, apiUrl, output } = client;
  const { token } = authConfig;

  if (!token) {
    output.note(
      `Not currently logged in, so ${getCommandName('logout')} did nothing`
    );
    return 0;
  }

  output.spinner('Logging out…', 200);

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
    output.error(`Couldn't remove config while logging out`);
    return 1;
  }

  const res = await fetch(`${apiUrl}/v3/user/tokens/current`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 403) {
    output.debug('Token is invalid so it cannot be revoked');
  } else if (res.status !== 200) {
    const err = await res.json();
    output.error('Failed to revoke token');
    output.debug(err ? err.message : '');
    return 1;
  }

  output.log('Logged out!');
  return 0;
}
