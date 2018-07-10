// @flow
import chalk from 'chalk'
import createOutput from '../../../../util/output'
import getArgs from '../../util/get-args'
import getSubcommand from '../../util/get-subcommand'
import logo from '../../../../util/output/logo'
import { Output } from '../../util/types'
import { handleError } from '../../util/error'
import type { CLIDNSOptions } from '../../util/types'

import add from './add'
import ls from './ls'
import rm from './rm'

const help = () => {
  console.log(`
  ${chalk.bold(
    `${logo} now dns`
  )} [options] <command>

  ${chalk.dim('Commands:')}

    add   [details]    Add a new DNS entry (see below for examples)
    rm    [id]         Remove a DNS entry using its ID
    ls    [domain]     List all DNS entries for a domain

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
    -T, --team                     Set a custom team scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add an A record for a subdomain

      ${chalk.cyan(
        '$ now dns add <DOMAIN> <SUBDOMAIN> <A | AAAA | ALIAS | CNAME | TXT>  <VALUE>'
      )}
      ${chalk.cyan('$ now dns add zeit.rocks api A 198.51.100.100')}

  ${chalk.gray('–')} Add an MX record (@ as a name refers to the domain)

      ${chalk.cyan(
        `$ now dns add <DOMAIN> '@' MX <RECORD VALUE> <PRIORITY>`
      )}
      ${chalk.cyan(`$ now dns add zeit.rocks '@' MX mail.zeit.rocks 10`)}

  ${chalk.gray('–')} Add an SRV record

      ${chalk.cyan(
        '$ now dns add <DOMAIN> <NAME> SRV <PRIORITY> <WEIGHT> <PORT> <TARGET>'
      )}
      ${chalk.cyan(`$ now dns add zeit.rocks '@' SRV 10 0 389 zeit.party`)}

  ${chalk.gray('–')} Add a CAA record

      ${chalk.cyan(
        `$ now dns add <DOMAIN> <NAME> CAA '<FLAGS> <TAG> "<VALUE>"'`
      )}
      ${chalk.cyan(`$ now dns add zeit.rocks '@' CAA '0 issue "zeit.co"'`)}
`)
}

const COMMAND_CONFIG = {
  add: ['add'],
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
}

module.exports = async function main(ctx: any): Promise<number> {
  let argv: CLIDNSOptions;

  try {
    argv = getArgs(ctx.argv.slice(2), {});
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
    case 'rm':
      return rm(ctx, argv, args, output);
    default:
      return ls(ctx, argv, args, output);
  }
}
