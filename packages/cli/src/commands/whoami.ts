import chalk from 'chalk';
import logo from '../util/output/logo';
import getScope from '../util/get-scope';
import { getPkgName } from '../util/pkg-name';
import getArgs from '../util/get-args';
import handleError from '../util/handle-error';
import Client from '../util/client';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} whoami`)}

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.vercel`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Shows the username of the currently logged in user

    ${chalk.cyan(`$ ${getPkgName()} whoami`)}
`);
};

export default async (client: Client): Promise<number> => {
  const { output } = client;
  let argv;
  try {
    argv = getArgs(client.argv.slice(2), {});
  } catch (error) {
    handleError(error);
    return 1;
  }

  argv._ = argv._.slice(1);

  if (argv['--help'] || argv._[0] === 'help') {
    help();
    return 2;
  }

  let contextName = null;

  try {
    ({ contextName } = await getScope(client, { getTeam: false }));
  } catch (err) {
    if (err.code === 'NOT_AUTHORIZED' || err.code === 'TEAM_DELETED') {
      output.error(err.message);
      return 1;
    }

    throw err;
  }

  if (process.stdout.isTTY) {
    output.log(contextName);
  } else {
    console.log(contextName);
  }

  return 0;
};
