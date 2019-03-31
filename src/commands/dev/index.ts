import chalk from 'chalk';

import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import { NowContext } from '../../types';
import { NowError } from '../../util/now-error';
import handleError from '../../util/handle-error';
import createOutput from '../../util/output/create-output';
import logo from '../../util/output/logo';
import cmd from '../../util/output/cmd';
import dev from './dev';
import { cleanCacheDir } from './lib/builder-cache';

const COMMAND_CONFIG = {
  dev: ['dev']
};

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now dev`)} [options] <command | dir>

  ${chalk.dim('Commands:')}

    start          [dir]     Starts the \`now dev\` server [default]
    cache clean              Deletes the local cache directories used by \`now dev\`

  ${chalk.dim('Options:')}

    -h, --help        Output usage information
    -d, --debug       Debug mode [off]
    -p, --port        Port [3000]

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Start the \`now dev\` server on port 8080

      ${chalk.cyan('$ now dev --port 8080')}
  `);
};

export default async function main(ctx: NowContext) {
  let argv;
  let args;
  let output;

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--port': Number,
      '-p': Number
    });
    args = getSubcommand(argv._.slice(1), COMMAND_CONFIG).args;
    output = createOutput({ debug: argv['--debug'] });
  } catch (err) {
    handleError(err);
    return 1;
  }

  if (argv['--help']) {
    help();
    return 2;
  }

  if (args[0] === 'cache' && args[1] === 'clean') {
    await cleanCacheDir(output);
    return 0;
  }

  if (argv._.length > 2) {
    output.error(`${cmd('now dev [dir]')} accepts at most one argument`);
    return 1;
  }

  try {
    return await dev(ctx, argv, args, output);
  } catch (err) {
    output.error(err.message);
    output.debug(stringifyError(err));
    return 1;
  }
}

// stringify error details for inspecting
function stringifyError(err: any) {
  if (err instanceof NowError) {
    const errMeta = JSON.stringify(err.meta, null, 2).replace(/\\n/g, '\n');
    return `${chalk.red(err.code)} ${err.message}\n${errMeta}`;
  }
  return err.stack;
}
