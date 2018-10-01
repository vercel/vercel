// @flow
import chalk from 'chalk'
import { handleError } from '../../util/error'
import { Output } from '../../util/types'
import createOutput from '../../../../util/output'
import getArgs from '../../util/get-args'
import getSubcommand from '../../util/get-subcommand'
import logo from '../../../../util/output/logo'
import type { CLIDomainsOptions } from '../../util/types'

import add from './add'
import buy from './buy'
import ls from './ls'
import rm from './rm'

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now domains`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls             Show all domains in a list
    add   [name]   Add a new domain that you already own
    rm    [name]   Remove a domain
    buy   [name]   Buy a domain that you don't yet own

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -d, --debug                    Debug mode [off]
    -e, --external                 Use external DNS server
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

  ${chalk.gray(
    '–'
  )} Add a domain using an external nameserver

      ${chalk.cyan('$ now domain add -e my-app.com')}
`)
}

const COMMAND_CONFIG = {
  add: ['add'],
  buy: ['buy'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
}

module.exports = async function main(ctx: any): Promise<number> {
  let argv: CLIDomainsOptions;

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--cdn': Boolean,
      '--no-cdn': Boolean,
      '--coupon': String,
      '--external': Boolean,
      '-c': '--coupon',
      '-e': '--external'
    })
  } catch (error) {
    handleError(error);
    return 1;
  }

  if (argv['--help']) {
    help()
    return 2;
  }

  const output: Output = createOutput({ debug: argv['--debug'] })
  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG)
  switch (subcommand) {
    case 'add':
      return add(ctx, argv, args, output);
    case 'buy':
      return buy(ctx, argv, args, output);
    case 'rm':
      return rm(ctx, argv, args, output);
    default:
      return ls(ctx, argv, args, output);
  }
}
