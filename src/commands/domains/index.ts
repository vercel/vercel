import chalk from 'chalk';

import { NowContext } from '../../types';
import createOutput from '../../util/output';
import getArgs from '../../util/get-args';
import getSubcommand from '../../util/get-subcommand';
import handleError from '../../util/handle-error';
import logo from '../../util/output/logo';

import add from './add';
import buy from './buy';
import inspect from './inspect';
import ls from './ls';
import rm from './rm';
import verify from './verify';

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now domains`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls               Show all domains in a list
    inspect [name]   Displays information related to a domain
    add     [name]   Add a new domain that you already own
    rm      [name]   Remove a domain
    buy     [name]   Buy a domain that you don't yet own
    verify  [name]   Run a verification for a domain

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -d, --debug                    Debug mode [off]
    --cdn                          Enable CDN support for the specified domain
    --no-cdn                       Disable CDN support for the specified domain, if it was previously enabled
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -T, --team                     Set a custom team scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a domain that you already own

      ${chalk.cyan(`$ now domains add ${chalk.underline('domain-name.com')}`)}

      Make sure the domain's DNS nameservers are at least 2 of the
      ones listed on ${chalk.underline('https://zeit.world')}.

      ${chalk.yellow('NOTE:')} Running ${chalk.dim(
    '`now alias`'
  )} will automatically register your domain
      if it's configured with these nameservers (no need to ${chalk.dim(
        '`domain add`'
      )}).
`);
};

const COMMAND_CONFIG = {
  add: ['add'],
  buy: ['buy'],
  inspect: ['inspect'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
  verify: ['verify']
};

export default async function main(ctx: NowContext) {
  let argv;

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--cdn': Boolean,
      '--no-cdn': Boolean,
      '--yes': Boolean
    });
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
    case 'add':
      return add(ctx, argv, args, output);
    case 'inspect':
      return inspect(ctx, argv, args, output);
    case 'buy':
      return buy(ctx, argv, args, output);
    case 'rm':
      return rm(ctx, argv, args, output);
    case 'verify':
      return verify(ctx, argv, args, output);
    default:
      return ls(ctx, argv, args, output);
  }
}
