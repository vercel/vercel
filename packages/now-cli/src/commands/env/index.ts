import chalk from 'chalk';

import { NowContext } from '../../types';
import createOutput from '../../util/output';
import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';
import logo from '../../util/output/logo';

import set from './set';
import pull from './pull';
import ls from './ls';
import rm from './rm';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now env`)} [options] <command>

  ${chalk.dim('Commands:')}

    set     [key] [environment]        Set environment variable (see below for examples)
    pull    [filename]                 Read development environment from the cloud and write to a file, default .env
    rm      [key] [environment]        Remove environment variable
    ls      [environment]              List all variables for the specified environment

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a new variable to multiple environments

      ${chalk.cyan('$ now env set <key>')}
      ${chalk.cyan('$ now env set API_TOKEN')}

  ${chalk.gray('–')} Add a new variable for a specific environment

      ${chalk.cyan('$ now env set <key> <production | preview | development>')}
      ${chalk.cyan('$ now env set DB_CONNECTION production')}

  ${chalk.gray('–')} Add a new environment variable from stdin

      ${chalk.cyan(
        '$ cat <file> | now env set <key> <production | preview | development>'
      )}
      ${chalk.cyan('$ cat ~/.npmrc | now env set NPM_RC preview')}

  ${chalk.gray('–')} Remove a variable from multiple environments

      ${chalk.cyan('$ now env rm <key>')}
      ${chalk.cyan('$ now env rm API_TOKEN')}

  ${chalk.gray('–')} Remove a variable from a specific environment

      ${chalk.cyan('$ now env rm <key> <production | preview | development>')}
      ${chalk.cyan('$ now env rm NPM_RC preview')}
`);
};

const COMMAND_CONFIG = {
  set: ['set'],
  pull: ['pull'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
};

export default async function main(ctx: NowContext) {
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2), {});
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const output = createOutput({ debug: argv['--debug'] });
  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG);
  switch (subcommand) {
    case 'set':
      return set(ctx, argv, args, output);
    case 'pull':
      return pull(ctx, argv, args, output);
    case 'rm':
      return rm(ctx, argv, args, output);
    case 'ls':
      return ls(ctx, argv, args, output);
    default:
      help();
      return 2;
  }
}
