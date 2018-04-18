// @flow

// Packages
const chalk = require('chalk')
const ms = require('ms')
const plural = require('pluralize')
const table = require('text-table')

// Utilities
const { handleError } = require('../../util/error')
const cmd = require('../../../../util/output/cmd')
const createOutput = require('../../../../util/output')
const getContextName = require('../../util/get-context-name')
const logo = require('../../../../util/output/logo')
const Now = require('../../util/')
const NowAlias = require('../../util/alias')
const stamp = require('../../../../util/output/stamp')
const strlen = require('../../util/strlen')
const toHost = require('../../util/to-host')
const wait = require('../../../../util/output/wait')

import set from './set'

import { Output } from '../../util/types'
import * as Errors from '../../util/errors'
import getArgs from '../../util/get-args'
import getSubcommand from './get-subcommand'
import promptBool from './prompt-bool'

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now alias`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls    [app]                  Show all aliases (or per app name)
    set   <deployment> <alias>   Create a new alias
    rm    <alias>                Remove an alias using its hostname

  ${chalk.dim('Options:')}

    -h, --help                          Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}        Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}         Path to the global ${'`.now`'} directory
    -r ${chalk.bold.underline('RULES_FILE')}, --rules=${chalk.bold.underline(
    'RULES_FILE'
  )}   Rules file
    -d, --debug                         Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}             Login token
    -T, --team                          Set a custom team scope
    -n, --no-verify                     Don't wait until instance count meets the previous alias constraints

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a new alias to ${chalk.underline('my-api.now.sh')}

      ${chalk.cyan(
        `$ now alias set ${chalk.underline(
          'api-ownv3nc9f8.now.sh'
        )} ${chalk.underline('my-api.now.sh')}`
      )}

      Custom domains work as alias targets

      ${chalk.cyan(
        `$ now alias set ${chalk.underline(
          'api-ownv3nc9f8.now.sh'
        )} ${chalk.underline('my-api.com')}`
      )}

      ${chalk.dim('–')} The subcommand ${chalk.dim(
    '`set`'
  )} is the default and can be skipped.
      ${chalk.dim('–')} ${chalk.dim(
    'Protocols'
  )} in the URLs are unneeded and ignored.

  ${chalk.gray('–')} Add and modify path based aliases for ${chalk.underline(
    'zeit.ninja'
  )}

      ${chalk.cyan(
        `$ now alias ${chalk.underline('zeit.ninja')} -r ${chalk.underline(
          'rules.json'
        )}`
      )}

      Export effective routing rules

      ${chalk.cyan(
        `$ now alias ls aliasId --json > ${chalk.underline('rules.json')}`
      )}
`)
}

const COMMAND_CONFIG = {
  default: 'set',
  ls: ['ls', 'list'],
  rm: ['rm', 'remove'],
  set: ['set'],
}

module.exports = async function main(ctx: any): Promise<number> {
  let argv
  try {
    argv = getArgs(ctx.argv.slice(2), {
      '--json': Boolean,
      '--no-verify': Boolean,
      '--rules': String,
      '--yes': Boolean,
      '-n': '--no-verify',
      '-r': '--rules',
      '-y': '--yes',
    })
  } catch (err) {
    handleError(err)
    return 1;
  }

  if (argv['--help']) {
    help()
    return 2;
  }

  const output: Output = createOutput({ debug: argv['--debug'] })
  const { subcommand, args } = getSubcommand(argv._.slice(1), COMMAND_CONFIG)
  switch (subcommand) {
    case 'ls':
      return ls(ctx, argv, args, output);
    case 'rm':
      return rm(ctx, argv, args, output);
    default:
      return set(ctx, argv, args, output);
  }
}

async function confirmDeploymentRemoval(output, _alias) {
  const time = chalk.gray(ms(new Date() - new Date(_alias.created)) + ' ago')
  const _sourceUrl = _alias.deployment ? chalk.underline(_alias.deployment.url) : null
  const tbl = table(
    [
      [
        ...(_sourceUrl ? [_sourceUrl] : []),
        chalk.underline(_alias.alias),
        time
      ]
    ], {
    align: ['l', 'l', 'r'],
    hsep: ' '.repeat(4),
    stringLength: strlen
  })

  return promptBool(output, `The following alias will be removed permanently\n  ${tbl} \n  ${chalk.red('Are you sure?')}`)
}

function findAlias(alias, list, output) {
  let key
  let val

  if (/\./.test(alias)) {
    val = toHost(alias)
    key = 'alias'
  } else {
    val = alias
    key = 'uid'
  }

  const _alias = list.find(d => {
    if (d[key] === val) {
      output.debug(`matched alias ${d.uid} by ${key} ${val}`)
      return true
    }

    // Match prefix
    if (`${val}.now.sh` === d.alias) {
      output.debug(`matched alias ${d.uid} by url ${d.host}`)
      return true
    }

    return false
  })

  return _alias
}

async function ls (ctx, opts, args, output): Promise<number> {
  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')
  const { currentTeam } = sh;
  const contextName = getContextName(sh);

  const {log, error, print} = output;
  const { apiUrl } = ctx;
  const { ['--debug']: debugEnabled } = opts;

  const alias = new NowAlias({ apiUrl, token, debug: debugEnabled, currentTeam })

  if (args.length === 1) {
    let cancelWait;

    if (!opts['--json']) {
      cancelWait = wait(`Fetching alias details for "${args[0]}" under ${chalk.bold(contextName)}`);
    }

    const list = await alias.listAliases()
    const item = list.find(listItem => {
      return (listItem.uid === args[0] || listItem.alias === args[0])
    })

    if (!item || !item.rules) {
      if (cancelWait) {
        cancelWait()
      }
      error(`Could not match path alias for: ${args[0]}`)
      return 1
    }

    if (opts['--json']) {
      print(JSON.stringify({ rules: item.rules }, null, 2))
    } else {
      if (cancelWait) cancelWait();

      const header = [
        ['', 'pathname', 'method', 'dest'].map(s => chalk.dim(s))
      ]
      const text =
        list.length === 0
          ? null
          : table(
              header.concat(
                item.rules.map(rule => {
                  return [
                    '',
                    rule.pathname ? rule.pathname : chalk.cyan('[fallthrough]'),
                    rule.method ? rule.method : '*',
                    rule.dest
                  ]
                })
              ),
              {
                align: ['l', 'l', 'l', 'l'],
                hsep: ' '.repeat(2),
                stringLength: strlen
              }
            )

      if (text === null) {
        // don't print anything, not even \n
      } else {
        print(text + '\n')
      }
    }
    return 0;
  } else if (args.length !== 0) {
    error(`Invalid number of arguments. Usage: ${chalk.cyan('`now alias ls`')}`)
    return 1
  }

  
  const fetchStamp = stamp()
  const aliases = await alias.ls()
  aliases.sort((a, b) => new Date(b.created) - new Date(a.created))
  log(
    `${
      plural('alias', aliases.length, true)
    } found under ${chalk.bold(contextName)} ${fetchStamp()}`
  )

  print('\n')

  console.log(
    table(
      [
        ['source', 'url', 'age'].map(h => chalk.gray(h)),
        ...aliases.map(
          a => ([
            a.rules && a.rules.length
              ? chalk.cyan(`[${plural('rule', a.rules.length, true)}]`)
              // for legacy reasons, we might have situations
              // where the deployment was deleted and the alias
              // not collected appropriately, and we need to handle it
              : a.deployment && a.deployment.url ?
                  a.deployment.url :
                  chalk.gray('–'),
            a.alias,
            ms(Date.now() - new Date(a.created))
          ])
        )
      ],
      {
        align: ['l', 'l', 'r'],
        hsep: ' '.repeat(4),
        stringLength: strlen
      }
    ).replace(/^/gm, '  ') + '\n\n'
  )

  alias.close()
  return 0
}

async function rm (ctx, opts, args, output): Promise<number> {
  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')
  const { currentTeam } = sh;
  const contextName = getContextName(sh);
  const { apiUrl } = ctx;
  const { ['--debug']: debugEnabled } = opts;
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam })
  const _target = String(args[0])

  if (!_target) {
    output.error(`${cmd('now alias rm <alias>')} expects one argument`)
    return 1
  }

  if (args.length !== 1) {
    output.error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now alias rm <alias>`'
      )}`
    )
    return 1
  }

  const _aliases = await now.listAliases()
  const alias = findAlias(_target, _aliases, output)

  if (!alias) {
    output.error(
      `Alias not found by "${_target}" under ${chalk.bold(contextName)}.
      Run ${cmd('`now alias ls`')} to see your aliases.`
    )
    return 1;
  }

  const removeStamp = stamp()
  try {
    const confirmation = opts['--yes'] || await confirmDeploymentRemoval(output, alias)
    if (!confirmation) {
      output.log('Aborted')
      return 0
    }

    await now.fetch(`/now/aliases/${alias.uid}`, { method: 'DELETE' })
  } catch (err) {
    output.error(err)
    return 1
  }

  console.log(`${chalk.cyan('> Success!')} Alias ${chalk.bold(alias.alias)} removed ${removeStamp()}`)
  return 0
}

export type SetupDomainError = 
  Errors.DNSPermissionDenied |
  Errors.DomainNameserversNotFound |
  Errors.DomainNotVerified |
  Errors.DomainPermissionDenied |
  Errors.DomainVerificationFailed |
  Errors.NeedUpgrade |
  Errors.PaymentSourceNotFound |
  Errors.UserAborted
