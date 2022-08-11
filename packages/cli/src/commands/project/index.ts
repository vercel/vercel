import chalk from 'chalk';
import Client from '../../util/client';
import getArgs from '../../util/get-args';
import getInvalidSubcommand from '../../util/get-invalid-subcommand';
import getScope from '../../util/get-scope';
import handleError from '../../util/handle-error';
import logo from '../../util/output/logo';
import { getPkgName } from '../../util/pkg-name';
import add from './add';
import list from './list';
import rm from './rm';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} project`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls                               Show all projects in the selected team/user
    add      [name]                  Add a new project
    rm       [name]                  Remove a project

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -S, --scope                    Set a custom scope
    -N, --next                     Show next page of results

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a new project

    ${chalk.cyan(`$ ${getPkgName()} project add my-project`)}

  ${chalk.gray('–')} Paginate projects, where ${chalk.dim(
    '`1584722256178`'
  )} is the time in milliseconds since the UNIX epoch.

    ${chalk.cyan(`$ ${getPkgName()} project ls --next 1584722256178`)}
`);
};

const COMMAND_CONFIG = {
  ls: ['ls', 'list'],
  add: ['add'],
  rm: ['rm', 'remove'],
};

export default async function main(client: Client) {
  let argv: any;
  let subcommand: string | string[];

  try {
    argv = getArgs(client.argv.slice(2), {
      '--next': Number,
      '-N': '--next',
    });
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  argv._ = argv._.slice(1);
  subcommand = argv._[0] || 'list';
  const args = argv._.slice(1);
  const { output } = client;
  const { contextName } = await getScope(client);

  switch (subcommand) {
    case 'ls':
    case 'list':
      return await list(client, argv, args, contextName);
    case 'add':
      return await add(client, args, contextName);
    case 'rm':
    case 'remove':
      return await rm(client, args);
    default:
      output.error(getInvalidSubcommand(COMMAND_CONFIG));
      help();
      return 2;
  }
}
