// @flow
import chalk from 'chalk'

import { handleError } from '../../util/error'
import { Output } from '../../util/types'
import createOutput from '../../../../util/output'
import getArgs from '../../util/get-args'
import getSubcommand from '../../util/get-subcommand'
import logo from '../../../../util/output/logo'
import type { CLICertsOptions } from '../../util/types'

import add from './add'
import ls from './ls'
import rm from './rm'

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now certs`)} [options] <command>

  ${chalk.yellow('NOTE:')} This command is intended for advanced use only.
  By default, Now manages your certificates automatically.

  ${chalk.dim('Commands:')}

    ls                    Show all available certificates
    add    <cn>[, <cn>]   Create a certificate for a domain
    rm     <id or cn>     Remove an available certificate

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
    --crt ${chalk.bold.underline('FILE')}                     Certificate file
    --key ${chalk.bold.underline('FILE')}                     Certificate key file
    --ca ${chalk.bold.underline('FILE')}                      CA certificate chain file

  ${chalk.dim('Examples:')}

  ${chalk.gray(
    '–'
  )} Generate a certificate with the cnames "acme.com" and "www.acme.com"

      ${chalk.cyan(
        '$ now certs add acme.com www.acme.com'
      )}

  ${chalk.gray(
    '–'
  )} Remove a certificate

      ${chalk.cyan(
        '$ now certs rm acme.com'
      )}
  `)
}

const COMMAND_CONFIG = {
  add: ['add'],
  ls: ['ls', 'list'],
  renew: ['renew'],
  rm: ['rm', 'remove'],
}

module.exports = async function main(ctx: any): Promise<number> {
  let argv: CLICertsOptions

  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--overwrite': Boolean,
      '--crt': String,
      '--key': String,
      '--ca': String,
    })
  } catch (err) {
    handleError(err)
    return 1
  }

  if (argv['--help']) {
    help()
    return 0
  }
  
  const output: Output = createOutput({ debug: argv['--debug'] })
  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG)
  switch (subcommand) {
    case 'add':
      return add(ctx, argv, args, output)
    case 'ls':
      return ls(ctx, argv, args, output)
    case 'rm':
      return rm(ctx, argv, args, output)
    case 'renew':
      output.error('Renewing certificates is deprecated, issue a new one.')
      return 1
    default:
      output.error('Please specify a valid subcommand: ls | add | rm')
      help()
      return 2
  }
}
