// @flow

// Packages
const arg = require('arg')
const chalk = require('chalk')
const ms = require('ms')
const plural = require('pluralize')
const table = require('text-table')

// Utilities
const { handleError } = require('../../util/error')
const argCommon = require('../../util/arg-common')()
const cmd = require('../../../../util/output/cmd')
const createOutput = require('../../../../util/output')
const getContextName = require('../../util/get-context-name')
const humanizePath = require('../../../../util/humanize-path')
const logo = require('../../../../util/output/logo')
const Now = require('../../util/')
const NowAlias = require('../../util/alias')
const stamp = require('../../../../util/output/stamp')
const strlen = require('../../util/strlen')
const toHost = require('../../util/to-host')
const wait = require('../../../../util/output/wait')

import { Output } from '../../util/types'
import * as Errors from '../../util/errors'
import assignAlias from './assign-alias'
import getDeploymentForAlias from './get-deployment-for-alias'
import getRulesFromFile from './get-rules-from-file'
import getSubcommand from './get-subcommand'
import getTargetsForAlias from './get-targets-for-alias'
import promptBool from './prompt-bool'
import upsertPathAlias from './upsert-path-alias'

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
    argv = arg(ctx.argv.slice(2), {
      ...argCommon,
      '--yes': Boolean,
      '-y': '--yes',

      '--json': Boolean,

      '--rules': String,
      '--no-verify': Boolean,
      '-n': '--no-verify',
      '-r': '--rules'
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

async function set(ctx, opts, args, output): Promise<number> {
  // Prepare the context
  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')
  const { user, currentTeam } = sh;
  const contextName = getContextName(sh);
  const { apiUrl } = ctx;
  const { ['--debug']: debugEnabled, ['--rules']: rulesPath, ['--no-verify']: noVerify } = opts;
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam })
  const start = Date.now()

  // If there are more than two args we have to error
  if (args.length > 2) {
    output.error(`${cmd('now alias <deployment> <target>')} accepts at most two arguments`);
    return 1;
  }

  // Read the path alias rules in case there is is given
  const rules = await getRulesFromFile(rulesPath)
  if (rules instanceof Errors.FileNotFound) {
    output.error(`Can't find the provided rules file at location:`);
    output.print(`  ${chalk.gray('-')} ${rules.meta.file}\n`)
    return 1
  } else if (rules instanceof Errors.CantParseJSONFile) {
    output.error(`Error parsing provided rules.json file at location:`);
    output.print(`  ${chalk.gray('-')} ${rules.meta.file}\n`)
    return 1
  } else if (rules instanceof Errors.RulesFileValidationError) {
    output.error(`Path Alias validation error: ${rules.meta.message}`);
    output.print(`  ${chalk.gray('-')} ${rules.meta.location}\n`)
    return 1
  }

  // If the user provided rules and also a deployment target, we should fail
  if (args.length === 2 && rules) {
    output.error(`You can't supply a deployment target and target rules simultaneously.`);
    return 1
  }

  // Find the targets to perform the alias
  const targets = await getTargetsForAlias(output, args, opts['--local-config'])
  if (targets instanceof Errors.CantFindConfig) {
    output.error(`Couldn't find a project configuration file at \n    ${targets.meta.paths.join(' or\n    ')}`)
    return 1
  } else if (targets instanceof Errors.NoAliasInConfig) {
    output.error(`Couldn't find a an alias in config`)
    return 1
  } else if (targets instanceof Errors.InvalidAliasInConfig) {
    output.error(`Wrong value for alias found in config. It must be a string or array of string.`)
    return 1
  } else if (targets instanceof Errors.CantParseJSONFile) {
    output.error(`Couldn't parse JSON file ${targets.meta.file}.`);
    return 1
  } else if (targets instanceof Errors.InvalidAliasTarget) {
    output.error(`Invalid target to alias ${targets.meta.target}`);
    return 1
  }

  if (rules) {
    // If we have rules for path alias we assign them to the domain
    for (const target of targets) {
      output.log(`Assigning path alias rules from ${humanizePath(rulesPath)} to ${target}`)
      const pathAlias = await upsertPathAlias(output, now, rules, target, contextName)
      if (handleSetupDomainErrorImpl(output, handleCreateAliasErrorImpl(output, pathAlias)) !== 1) {
        console.log(`${chalk.cyan('> Success!')} ${rules.length} rules configured for ${chalk.underline(target)} ${chalk.grey(
          '[' + ms(Date.now() - start) + ']'
        )}`)
      }
    }
  } else {
    // If there are no rules for path alias we should find out a deployment and perform the alias
    const deployment = await getDeploymentForAlias(now, output, args, opts['--local-config'], user, contextName)
    if (deployment instanceof Errors.DeploymentNotFound) {
      output.error(`Failed to find deployment "${deployment.meta.id}" under ${chalk.bold(contextName)}`)
      return 1
    } else if (deployment instanceof Errors.DeploymentPermissionDenied) {
      output.error(`No permission to access deployment "${deployment.meta.id}" under ${chalk.bold(deployment.meta.context)}`)
      return 1
    } else if (deployment === null) {
      output.error(`Couldn't find a deployment to alias. Please provide one as an argument.`);
      return 1
    }

    // Assign the alias for each of the targets in the array
    for (const target of targets) {
      output.log(`Assigning alias ${target} to deployment ${deployment.url}`)
      const record = await assignAlias(output, now, deployment, target, contextName, noVerify)
      if (handleSetupDomainErrorImpl(output, handleCreateAliasErrorImpl(output, record)) !== 1) {
        console.log(`${chalk.cyan('> Success!')} ${target} now points to ${chalk.bold(deployment.url)}! ${chalk.grey(
          '[' + ms(Date.now() - start) + ']'
        )}`)
      }
    }
  }

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

function handleSetupDomainErrorImpl<Other>(output: Output, error: SetupDomainError | Other): 1 | Other {
  if (error instanceof Errors.DomainVerificationFailed) {
    output.error(`We couldn't verify the domain ${chalk.underline(error.meta.domain)}.\n`)
    output.print(`  Please make sure that your nameservers point to ${chalk.underline('zeit.world')}.\n`)
    output.print(`  Examples: (full list at ${chalk.underline('https://zeit.world')})\n`)
    output.print(zeitWorldTable() + '\n');
    output.print(`\n  As an alternative, you can add following records to your DNS settings:\n`)
    output.print(dnsTable([
      ['_now', 'TXT', error.meta.token],
      error.meta.subdomain === null
        ? ['', 'ALIAS', 'alias.zeit.co']
        : [error.meta.subdomain, 'CNAME', 'alias.zeit.co']  
    ], '  ') + '\n');
    return 1
  } else if (error instanceof Errors.DomainPermissionDenied) {
    output.error(`You don't have permissions over domain ${chalk.underline(error.meta.domain)} under ${chalk.bold(error.meta.context)}.`)
    return 1
  } else if (error instanceof Errors.PaymentSourceNotFound) {
    output.error(`No credit cards found to buy the domain. Please run ${cmd('now cc add')}.`)
    return 1
  } else if (error instanceof Errors.NeedUpgrade) {
    output.error(`Custom domains are only supported for premium accounts. Please upgrade.`)
    return 1
  } else if (error instanceof Errors.DomainNotVerified) {
    output.error(`We couldn't verify the domain ${chalk.underline(error.meta.domain)}. Please try again later`)
    return 1
  } else if (error instanceof Errors.DomainNameserversNotFound) {
    output.error(`Couldn't find nameservers for the domain ${chalk.underline(error.meta.domain)}`)
    return 1
  } else if (error instanceof Errors.DNSPermissionDenied) {
    output.error(`You don't have permissions to access the DNS records for ${chalk.underline(error.meta.domain)}`)
    return 1
  } else if (error instanceof Errors.UserAborted) {
    return 1
  } else {
    return error
  }
}

function zeitWorldTable() {
  return table([
    [chalk.underline('a.zeit.world'), chalk.dim('96.45.80.1')],
    [chalk.underline('b.zeit.world'), chalk.dim('46.31.236.1')],
    [chalk.underline('c.zeit.world'), chalk.dim('43.247.170.1')],
  ], {
    align: ['l', 'l'],
    hsep: ' '.repeat(8),
    stringLength: strlen
  }).replace(/^(.*)/gm, '    $1')
}

function dnsTable(rows, extraSpace = '') {
  return table([
    ['name', 'type', 'value'].map(v => chalk.gray(v)),
    ...rows
  ], {
    align: ['l', 'l', 'l'],
    hsep: ' '.repeat(8),
    stringLength: strlen
  }).replace(/^(.*)/gm, `${extraSpace}  $1`)
}

type CreateAliasError =
  Errors.AliasInUse |
  Errors.DeploymentNotFound |
  Errors.DeploymentPermissionDenied |
  Errors.DomainConfigurationError |
  Errors.DomainNotFound |
  Errors.DomainPermissionDenied |
  Errors.DomainsShouldShareRoot |
  Errors.DomainValidationRunning |
  Errors.InvalidAlias | 
  Errors.InvalidWildcardDomain |
  Errors.NeedUpgrade |
  Errors.RuleValidationFailed |
  Errors.TooManyCertificates |
  Errors.TooManyRequests |
  Errors.VerifyScaleTimeout

function handleCreateAliasErrorImpl<OtherError>(output: Output, error: CreateAliasError | OtherError): 1 | OtherError {
  if (error instanceof Errors.AliasInUse) {
    output.error(`The alias ${chalk.dim(error.meta.alias)} is a deployment URL or it's in use by a different team.`)
    return 1
  } else if (error instanceof Errors.DeploymentNotFound) {
    output.error(`Failed to find deployment ${chalk.dim(error.meta.id)} under ${chalk.bold(error.meta.context)}`)
    return 1
  } else if (error instanceof Errors.InvalidAlias ) {
    output.error(`Invalid alias. Nested domains are not supported.`)
    return 1
  } else if (error instanceof Errors.DomainPermissionDenied) {
    output.error(`No permission to access domain ${chalk.underline(error.meta.domain)} under ${chalk.bold(error.meta.context)}`)
    return 1
  } else if (error instanceof Errors.DeploymentPermissionDenied) {
    output.error(`No permission to access deployment ${chalk.dim(error.meta.id)} under ${chalk.bold(error.meta.context)}`)
    return 1
  } else if (error instanceof Errors.NeedUpgrade) {
    output.error(`Custom domains are only supported for premium accounts. Please upgrade.`)
    return 1
  } else if (error instanceof Errors.DomainConfigurationError) {
    output.error(`We couldn't verify the propagation of the DNS settings for ${chalk.underline(error.meta.domain)}`)
    if (error.meta.external) {
      output.print(`  The propagation may take a few minutes, but please verify your settings:\n\n`)
      output.print(dnsTable([
        error.meta.subdomain === null
          ? ['', 'ALIAS', 'alias.zeit.co']
          : [error.meta.subdomain, 'CNAME', 'alias.zeit.co']  
      ]) + '\n');
    } else {
      output.print(`  We configured them for you, but the propagation may take a few minutes.\n`)
      output.print(`  Please try again later.\n`)
    }
    return 1
  } else if (error instanceof Errors.TooManyCertificates) {
    output.error(`Too many certificates already issued for exact set of domains: ${error.meta.domains.join(', ')}`)
    return 1
  } else if (error instanceof Errors.DomainValidationRunning) {
    output.error(`There is a validation in course for ${chalk.underline(error.meta.domain)}. Wait until it finishes.`)
    return 1
  } else if (error instanceof Errors.RuleValidationFailed) {
    output.error(`Rule validation error: ${error.meta.message}.`)
    output.print(`  Make sure your rules file is written correctly.\n`)
    return 1
  } else if (error instanceof Errors.TooManyRequests) {
    output.error(`Too many requests detected for ${error.meta.api} API. Try again later.`)
    return 1
  } else if (error instanceof Errors.DomainNotFound) {
    output.error(`You should buy the domain before aliasing.`)
    return 1
  } else if (error instanceof Errors.VerifyScaleTimeout) {
    output.error(`Instance verification timed out (${ms(error.meta.timeout)})`)
    output.log('Read more: https://err.sh/now-cli/verification-timeout')
    return 1
  } else if (error instanceof Errors.InvalidWildcardDomain) {
    // this should never happen
    output.error(`Invalid domain ${chalk.underline(error.meta.domain)}. Wildcard domains can only be followed by a root domain.`)
    return 1
  } else if (error instanceof Errors.DomainsShouldShareRoot) {
    // this should never happen either
    output.error(`All given common names should share the same root domain.`)
    return 1
  } else {
    return error
  }
}
