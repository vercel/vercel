import chalk from 'chalk';

import { handleError } from '../../util/error';

import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import logo from '../../util/output/logo';
import { getPkgName } from '../../util/pkg-name.ts';

import ls from './ls';
import rm from './rm';
import set from './set';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} alias`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls                           Show all aliases
    set   <deployment> <alias>   Create a new alias
    rm    <alias>                Remove an alias using its hostname

  ${chalk.dim('Options:')}

    -h, --help                          Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}        Path to the local ${'`vercel.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}         Path to the global ${'`.vercel`'} directory
    -d, --debug                         Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}             Login token
    -S, --scope                         Set a custom scope
    -N, --next                          Show next page of results
  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a new alias to ${chalk.underline('my-api.vercel.app')}

      ${chalk.cyan(
        `$ ${getPkgName()} alias set ${chalk.underline(
          'api-ownv3nc9f8.vercel.app'
        )} ${chalk.underline('my-api.vercel.app')}`
      )}

      Custom domains work as alias targets

      ${chalk.cyan(
        `$ ${getPkgName()} alias set ${chalk.underline(
          'api-ownv3nc9f8.vercel.app'
        )} ${chalk.underline('my-api.com')}`
      )}

      ${chalk.dim('–')} The subcommand ${chalk.dim(
    '`set`'
  )} is the default and can be skipped.
      ${chalk.dim('–')} ${chalk.dim(
    'Protocols'
  )} in the URLs are unneeded and ignored.
`);
};

const COMMAND_CONFIG = {
  default: 'set',
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
  set: ['set'],
};

export default async function main(ctx) {
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--json': Boolean,
      '--yes': Boolean,
      '--next': Number,
      '-y': '--yes',
      '-N': '--next',
    });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG);

  switch (subcommand) {
    case 'ls':
      return ls(ctx, argv, args);
    case 'rm':
      return rm(ctx, argv, args);
    default:
      return set(ctx, argv, args);
  }
}
