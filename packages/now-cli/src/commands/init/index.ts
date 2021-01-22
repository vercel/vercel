import chalk from 'chalk';

import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { NowContext } from '../../types';
import handleError from '../../util/handle-error';
import logo from '../../util/output/logo';
import error from '../../util/output/error';
import init from './init';
import { getPkgName } from '../../util/pkg-name';

const COMMAND_CONFIG = {
  init: ['init'],
};

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} ${getPkgName()} init`)} [example] [dir] [-f | --force]

  ${chalk.dim('Options:')}

    -h, --help        Output usage information
    -d, --debug       Debug mode [off]
    -f, --force       Overwrite destination directory if exists [off]

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')}  Choose from all available examples

      ${chalk.cyan(`$ ${getPkgName()} init`)}

  ${chalk.gray('–')}  Initialize example project into a new directory

      ${chalk.cyan(`$ ${getPkgName()} init <example>`)}

  ${chalk.gray('–')}  Initialize example project into specified directory

      ${chalk.cyan(`$ ${getPkgName()} init <example> <dir>`)}

  ${chalk.gray('–')}  Initialize example project without checking

      ${chalk.cyan(`$ ${getPkgName()} init <example> --force`)}
  `);
};

export default async function main(ctx: NowContext) {
  let argv;
  let args;

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--force': Boolean,
      '-f': Boolean,
    });
    args = getSubcommand(argv._.slice(1), COMMAND_CONFIG).args;
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  if (argv._.length > 3) {
    ctx.output.error('Too much arguments.');
    return 1;
  }

  try {
    return await init(ctx, argv, args);
  } catch (err) {
    console.log(error(err.message));
    ctx.output.debug(err.stack);
    return 1;
  }
}
