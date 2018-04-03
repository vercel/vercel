// @flow

// Packages
const arg = require('arg')
const chalk = require('chalk')
const fetch = require('node-fetch')
const fs = require('fs-extra')
const ms = require('ms')
const path = require('path');
const plural = require('pluralize')
const psl = require('psl');
const qs = require('querystring')
const retry = require('async-retry')
const sleep = require('then-sleep');
const table = require('text-table')

// Utilities
const { handleError } = require('../util/error')
const { tick } = require('../../../util/output/chars')
const argCommon = require('../util/arg-common')()
const cmd = require('../../../util/output/cmd')
const createOutput = require('../../../util/output')
const elapsed = require('../../../util/output/elapsed')
const eraseLines = require('../../../util/output/erase-lines')
const getContextName = require('../util/get-context-name')
const humanizePath = require('../../../util/humanize-path')
const isValidDomain = require('../util/domains/is-valid-domain')
const logo = require('../../../util/output/logo')
const Now = require('../util/')
const NowAlias = require('../util/alias')
const promptBool = require('../../../util/input/prompt-bool')
const stamp = require('../../../util/output/stamp')
const strlen = require('../util/strlen')
const toHost = require('../util/to-host')
const wait = require('../../../util/output/wait')

// $FlowFixMe
const isTTY = process.stdout.isTTY

// the "auto" value for scaling
const AUTO = 'auto'
const USE_WILDCARD_CERTS = false

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

module.exports = async function main(ctx: any): Promise<number> {
  let argv
  let subcommand

  try {
    argv = arg(ctx.argv.slice(3), {
      ...argCommon,
      '--yes': Boolean,
      '-y': '--yes',

      '--json': Boolean,

      '--rules': String,
      '-r': '--rules'
    })
  } catch (err) {
    handleError(err)
    return 1;
  }

  subcommand = argv._[0]

  if (argv['--help']) {
    help()
    return 2;
  }

  const debugEnabled = argv['--debug']
  const output = createOutput({ debug: debugEnabled })
  let args

  switch (subcommand) {
    case 'ls':
    case 'list':
      args = argv._.slice(1);
      return ls(ctx, argv, args, output);
    case 'rm':
    case 'remove':
      args = argv._.slice(1)
      return rm(ctx, argv, args, output);
    case 'set':
      args = argv._.slice(1)
      return set(ctx, argv, args, output);
    default:
      args = argv._
      return set(ctx, argv, args, output);
  }
}

async function confirmDeploymentRemoval(_alias) {
  const time = chalk.gray(ms(new Date() - new Date(_alias.created)) + ' ago')
  const _sourceUrl = _alias.deployment
    ? chalk.underline(_alias.deployment.url)
    : null
  const tbl = table(
    [
      [
        ...(_sourceUrl ? [_sourceUrl] : []),
        chalk.underline(_alias.alias),
        time
      ]
    ],
    {
      align: ['l', 'l', 'r'],
      hsep: ' '.repeat(4),
      stringLength: strlen
    }
  )

  const msg = `The following alias will be removed permanently\n  ${tbl} \n  Are you sure?`
  return promptBool(msg, {
    trailing: '\n'
  })
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

  const fetchStart = new Date()
  const aliases = await alias.ls()

  aliases.sort((a, b) => new Date(b.created) - new Date(a.created))

  log(
    `${
      plural('alias', aliases.length, true)
    } found under ${chalk.bold(contextName)} ${elapsed(Date.now() - fetchStart)}`
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
  const {log, error} = output;
  const { apiUrl } = ctx;
  const { ['--debug']: debugEnabled } = opts;
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam })
  const _target = String(args[0])

  if (!_target) {
    error(`${cmd('now alias rm <alias>')} expects one argument`)
    return 1
  }

  if (args.length !== 1) {
    error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now alias rm <alias>`'
      )}`
    )
    return 1
  }

  const _aliases = await now.listAliases()
  const alias = findAlias(_target, _aliases, output)

  if (!alias) {
    error(
      `Alias not found by "${_target}" under ${chalk.bold(contextName)}.
      Run ${cmd('`now alias ls`')} to see your aliases.`
    )
    return 1;
  }

  const start = new Date()

  try {
    const confirmation = opts['--yes'] || await confirmDeploymentRemoval(alias)
    if (!confirmation) {
      log('Aborted')
      return 0
    }

    await now.fetch(`/now/aliases/${alias.uid}`, { method: 'DELETE' })
  } catch (err) {
    error(err)
    return 1
  }

  const elapsed = ms(new Date() - start)
  console.log(`${chalk.cyan('> Success!')} Alias ${chalk.bold(alias.alias)} removed [${elapsed}]`)
  return 0
}

async function set(ctx, opts, args, output): Promise<number> {
  // Prepare the context
  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')
  const { user, currentTeam } = sh;
  const contextName = getContextName(sh);
  const { apiUrl } = ctx;
  const { ['--debug']: debugEnabled } = opts;
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam })
  const start = Date.now()

  // Get deployments and targets from opts and args
  const params = await getTargetsAndDeployment(now, output, args, opts, user, contextName)
  if (params instanceof NowError) {
    switch (params.code) {
      case 'CANT_FIND_CONFIG':
        output.error(`Couldn't find a configuration file at \n    ${params.meta.paths.join('\n    ')}.`)
        break
      case 'CANT_PARSE_CONFIG':
        output.error(`Couldn't parse configuration file ${params.meta.file}.`);
        break
      case 'NO_ALIAS_IN_CONFIG':
        output.error(`Could't find an alias property into the given configuration.`)
        break
      case 'WRONG_ALIAS_IN_CONFIG':
        output.error(`Wrong value "${params.meta.value}" for alias found in config. It must be a string or array of string.`)
        break
      case 'CANT_FIND_A_DEPLOYMENT':
        output.error(`Could't find a deployment to alias. Please specify one from the command line.`)
        break
      case 'DEPLOYMENT_NOT_FOUND':
        output.error(`Failed to find deployment "${params.meta.id}" under ${chalk.bold(contextName)}`)
        break
      case 'DEPLOYMENT_PERMISSION_DENIED':
        output.error(`No permission to access deployment "${params.meta.id}" under ${chalk.bold(contextName)}`)
        break
      case 'TOO_MANY_ARGS':
        output.error(`${cmd('now alias <deployment> <target>')} accepts at most two arguments`);
        break
    }
    return 1
  }

  // Now we are sure we have values for deployment and targets
  const { deployment, targets } = params

  // Validate the resolved targets
  const targetError = targetsAreValid(targets)
  if (targetError instanceof NowError) {
    output.error(`Invalid target ${targetError.meta.target}`);
    return 1
  }

  // Assign the alias for each of the targets in the array
  for (const target of addZeitDomainIfNeeded(targets)) {
    const result = await assignAlias(output, now, deployment, target, contextName)
    if (result instanceof NowError) {
      switch (result.code) {
        case 'DOMAIN_VERIFICATION_FAILED':
          output.error(`Please make sure that your nameservers point to ${chalk.underline('zeit.world')}.`)
          output.print(`  Examples: (full list at ${chalk.underline('https://zeit.world')})\n`)
          output.print(`  ${chalk.gray('-')} ${chalk.underline('a.zeit.world')}    ${chalk.dim('96.45.80.1')}\n`)
          output.print(`  ${chalk.gray('-')} ${chalk.underline('b.zeit.world')}    ${chalk.dim('46.31.236.1')}\n`)
          output.print(`  ${chalk.gray('-')} ${chalk.underline('c.zeit.world')}    ${chalk.dim('43.247.170.1')}\n`)
          output.print(`\n  Alternatively, make sure to:`)
          output.print(`\n  ${chalk.gray('-')} Verify the domain by adding a TXT record on your DNS server: _now.${result.meta.domain}: ${result.meta.token}`)
          output.print(
            result.meta.subdomain === null
              ? `\n  ${chalk.gray('-')} Ensure it resolves to ${chalk.underline('alias.zeit.co')} by adding an ${chalk.dim('ALIAS')} record for <domain>.\n`
              : `\n  ${chalk.gray('-')} Ensure it resolves to ${chalk.underline('alias.zeit.co')} by adding a ${chalk.dim('CNAME')} record with name '${result.meta.subdomain}'.\n`
          )
          break
        case 'UNABLE_TO_RESOLVE_EXTERNAL':
          output.error(`Please make sure that your nameservers point to ${chalk.underline('zeit.world')}.`)
          output.print(`  Examples: (full list at ${chalk.underline('https://zeit.world')})\n`)
          output.print(`  ${chalk.gray('-')} ${chalk.underline('a.zeit.world')}    ${chalk.dim('96.45.80.1')}\n`)
          output.print(`  ${chalk.gray('-')} ${chalk.underline('b.zeit.world')}    ${chalk.dim('46.31.236.1')}\n`)
          output.print(`  ${chalk.gray('-')} ${chalk.underline('c.zeit.world')}    ${chalk.dim('43.247.170.1')}\n`)
          output.print(`\n  Alternatively, make sure to:`)
          output.print(
            result.meta.subdomain === null
              ? `\n  ${chalk.gray('-')} Ensure it resolves to ${chalk.underline('alias.zeit.co')} by adding an ${chalk.dim('ALIAS')} record.\n`
              : `\n  ${chalk.gray('-')} Ensure it resolves to ${chalk.underline('alias.zeit.co')} by adding a ${chalk.dim('CNAME')} record with name '${result.meta.subdomain}'.\n`
          )
          break
        case 'UNABLE_TO_RESOLVE_INTERNAL':
          output.error(
            `We configured the DNS settings for your alias, but we were unable to ` +
            `verify that they've propagated. Please try the alias again later.`
          )
          break
        case 'SOURCE_NOT_FOUND':
          output.error(`No credit cards found to buy ${result.meta.domain} – please run ${cmd('now cc add')}.`)
          break
        case 'NO_DOMAIN_PERMISSIONS':
          output.error(`You don't have permissions over domain ${result.meta.domain} under ${chalk.bold(contextName)}.`)
          break
        case 'USER_ABORT':
          output.error(`User aborted.`)
          break
        case 'DOMAIN_IS_NOT_VERIFIED':
          output.error(`We couldn't verify the domain ${result.meta.domain}. Please try again later`)
          break
        case 'ALIAS_IN_USE':
          output.error(`The alias ${chalk.dim(target)} is in use by a different team.`)
          break
        case 'DEPLOYMENT_NOT_FOUND':
          output.error(`Failed to find deployment "${result.meta.id}" under ${chalk.bold(contextName)}`)
          break
        case 'INVALID_ALIAS':
          output.error(`Invalid alias. Nested domains are not supported.`)
          break
        case 'NEED_UPGRADE':
          output.error(`Custom domains are only supported for premium accounts. Please upgrade.`)
          break
        case 'DOMAIN_PERMISSION_DENIED':
          output.error(`You don't have permissions to access the domain ${target}`)
          break
        case 'NAMESERVERS_NOT_FOUND':
          output.error(`Couldn't find nameservers for the domain ${target}`)
          break
        case 'DNS_ACCESS_UNAUTHORIZED':
          output.error(`You don't have permissions to access the DNS records for ${target}`)
          break
        case 'DEPLOYMENT_PERMISSION_DENIED':
          output.error(`No permission to access deployment "${result.meta.id}" under ${chalk.bold(contextName)}`)
          break
        default:
          output.error(`Unhandled error ${result.code}`)
          break
      }

      return 1
    }

    console.log(`${chalk.cyan('> Success!')} ${target} now points to ${chalk.bold(deployment.url)}! ${chalk.grey(
      '[' + ms(Date.now() - start) + ']'
    )}`)
  }

  return 0
}

type NowErrorArgs<T, M> = {
  code: T,
  meta?: M,
  message?: string
}

// A generic error to rule them all
class NowError<T, M = {}> extends Error {
  meta: M;
  code: T;

  constructor({ code, message, meta }: NowErrorArgs<T, M>) {
    super(message)
    this.code = code;
    if (meta) {
      this.meta = meta;
    }
  }
}

async function readFileSafe(file): Promise<string | null> {
  return (await fs.exists(file))
    ? await fs.readFile(file)
    : null
}

type Config = {
  alias: Array<string> | string,
  aliases: Array<string> | string,
  name: string,
}

type ReadConfigErrors = NowError<'CANT_PARSE_CONFIG', { file: string }>

async function readConfigFromFile(file): Promise<Config | null | ReadConfigErrors> {
  const content = await readFileSafe(file)
  if (content === null) {
    return content
  }
  
  try {
    return (JSON.parse(content): Config);
  } catch (error) {
    return new NowError({
      code: 'CANT_PARSE_CONFIG',
      meta: { file }
    })
  }
}

async function readConfigFromPackage(file): Promise<Config | null | ReadConfigErrors> {
  const content = await readFileSafe(file)
  if (content === null) {
    return content
  }

  try {
    return JSON.parse(content).now;
  } catch (error) {
    return new NowError({
      code: 'CANT_PARSE_CONFIG',
      meta: { file }
    })
  }
}

type GetConfigErrors =
  ReadConfigErrors |
  NowError<'CANT_FIND_CONFIG', {paths: string[]}>

let config

async function getConfig(output, configFile): Promise<Config | GetConfigErrors> {
  const localPath = process.cwd()
  
  // If config was already read, just return it
  if (config) {
    return config
  }

  // First try with the config supplied by the user via --local-config
  if (configFile) {
    const localFilePath = path.resolve(localPath, configFile)
    output.debug(`Found config in provided --local-config path ${localFilePath}`)
    const localConfig = await readConfigFromFile(localFilePath)
    if (localConfig || localConfig instanceof NowError) {
      config = localConfig
      return localConfig
    }
  }

  // Then try with now.json in the same directory
  const nowFilePath = path.resolve(localPath, 'now.json')
  const mainConfig = await readConfigFromFile(nowFilePath);
  if (mainConfig && !(mainConfig instanceof NowError)) {
    output.debug(`Found config in file ${nowFilePath}`)
    config = mainConfig
    return mainConfig;
  }
  
  // Finally try with the package
  const pkgFilePath = path.resolve(localPath, 'package.json')
  const pkgConfig = await readConfigFromPackage(pkgFilePath);
  if (pkgConfig && !(pkgConfig instanceof NowError)) {
    output.debug(`Found config in package ${pkgFilePath}`)
    config = pkgConfig
    return pkgConfig
  }

  // If we couldn't find the config anywhere return error
  return new NowError({
    code: 'CANT_FIND_CONFIG' ,
    meta: { paths: [nowFilePath, pkgFilePath].map(humanizePath) }
  })
}

type GetInferredTargetsError =
  GetConfigErrors |
  NowError<'NO_ALIAS_IN_CONFIG'> |
  NowError<'WRONG_ALIAS_IN_CONFIG', {value: any}>

async function getInferredTargets(output, opts): Promise<Array<string> | GetInferredTargetsError> {  
  // Read the configuration file from the best guessed location
  const configResult = await getConfig(output, opts['--local-config']);
  if (configResult instanceof NowError) {
    return configResult
  }

  // This field is deprecated, warn about it
  if (configResult.aliases) {
    output.warn('The `aliases` field has been deprecated in favor of `alias`');
  }

  // The aliases can be stored in both aliases or alias
  const aliases = configResult.aliases || configResult.alias
  if (!aliases) {
    return new NowError({ code: 'NO_ALIAS_IN_CONFIG' })
  }

  // Check the type for the option aliases
  if (typeof aliases !== 'string' && !Array.isArray(aliases)) {
    return new NowError({ code: 'WRONG_ALIAS_IN_CONFIG', meta: { value: aliases }})
  }

  // Always resolve with an array
  return (Array.from(aliases): Array<string>)
}

async function getAppName(output, opts): Promise<string> {
  const config = await getConfig(output, opts['--local-config'])
  return config instanceof NowError || !config.name
    ? path.basename(path.resolve(process.cwd(), opts['--local-config'] || ''))
    : config.name
}

type FetchDeploymentErrors =
  NowError<'DEPLOYMENT_NOT_FOUND', { id: string }> |
  NowError<'DEPLOYMENT_PERMISSION_DENIED', { id: string }>

type Scale = { min: number, max: number }
type DeploymentScale = { [dc: string]: Scale }

type Deployment = {
  uid: string,
  url: string,
  name: string,
  type: 'NPM',
  state: 'FROZEN' | 'READY',
  created: number,
  creator: { uid: string },
  sessionAffinity: string,
  scale: DeploymentScale
}

async function fetchDeployment(output, now, contextName, id): Promise<Deployment | FetchDeploymentErrors> {
  const cancelWait = wait(`Fetching deployment "${id}" in ${chalk.bold(contextName)}`);
  try {
    const deployment = await now.findDeployment(id)
    cancelWait();
    return deployment
  } catch (err) {
    cancelWait();
    if (err.status === 404) {
      return new NowError({ code: 'DEPLOYMENT_NOT_FOUND', meta: { id } })
    } else if (err.status === 403) {
      return new NowError({ code: 'DEPLOYMENT_PERMISSION_DENIED', meta: { id } })
    } else {
      throw err;
    }
  }
}

type DeploymentItem = {
  uid: string,
  url: string,
  name: string,
  created: number,
  creator: { uid: string, },
  state: 'FROZEN' | 'READY',
  type: 'NPM',
}

async function fetchDeploymentsByAppName(now, appName): Promise<Array<DeploymentItem>> {
  return now.list(appName, { version: 3 });
}

type GetAppLastDeploymentErrors = 
  NowError<'CANT_FIND_A_DEPLOYMENT'> |
  FetchDeploymentErrors

async function getAppLastDeployment(output, now, appName, user, contextName): Promise<Deployment | GetAppLastDeploymentErrors> {
  output.debug(`Looking for deployments matching app ${appName}`)
  const cancelWait = wait(`Fetching user deployments in ${chalk.bold(contextName)}`)
  let deployments  
  try {
    deployments = await fetchDeploymentsByAppName(now, appName)
    cancelWait()
  } catch (error) {
    cancelWait()
    throw error
  }

  const deploymentItem = deployments
    .sort((a, b) => b.created - a.created)
    .filter(dep => dep.state === 'READY' && dep.creator.uid === user.uid)[0]

  // Try to fetch deployment details
  return deploymentItem
    ? await fetchDeployment(output, now, contextName, deploymentItem.uid)
    : new NowError({ code: 'CANT_FIND_A_DEPLOYMENT' })
}

type SetAliasArgs = {
  deployment: Deployment,
  targets: Array<string>,
}

type SetAliasErrors = 
  NowError<'TOO_MANY_ARGS'> |
  GetInferredTargetsError | 
  GetAppLastDeploymentErrors |
  FetchDeploymentErrors

async function getTargetsAndDeployment(now, output, args: Array<string>, opts, user, contextName): Promise<SetAliasArgs | SetAliasErrors> {
  // When there are no args at all we try to get the targets from the config
  if (args.length === 0) {
    output.debug('Looking for targets in the configuration directory');
    const targets = await getInferredTargets(output, opts)
    if (targets instanceof NowError) {
      return targets
    }

    const appName = await getAppName(output, opts)
    const deployment = await getAppLastDeployment(output, now, appName, user, contextName)
    return !(deployment instanceof NowError)
      ? { deployment, targets }
      : deployment
  }

  // When there is one arg we assume the user typed `now alias <target> because
  // he is in the app directory so we can infer the deployment
  if (args.length === 1) {
    const targets = [args[0]]
    const appName = await getAppName(output, opts)
    const deployment = await getAppLastDeployment(output, now, appName, user, contextName)
    return !(deployment instanceof NowError)
      ? { deployment, targets }
      : deployment
  }

  // In any other case the user provided both id and deployment id so we can just
  // fetch the deployment id to ensure it exists
  if (args.length === 2) {
    const [deploymentId, target] = args
    const deployment = await fetchDeployment(output, now, contextName, deploymentId)
    return !(deployment instanceof NowError)
      ? { deployment, targets: [target] }
      : deployment
  }

  return new NowError({ code: 'TOO_MANY_ARGS' })
}

type DomainValidationError = NowError<'INVALID_TARGET_DOMAIN', { target: string }>

function targetsAreValid(targets): Array<string> | DomainValidationError {
  for (const target of targets) {
    if (target.indexOf('.') !== -1 && !isValidDomain(target)) {
      return new NowError({
        code: 'INVALID_TARGET_DOMAIN',
        meta: { target }
      })
    }
  }

  return targets
}

function addZeitDomainIfNeeded(targets) {
  return targets.map(target => {
    return target.indexOf('.') === -1
      ? `${target}.now.sh`
      : target
  })
}

type Alias = {
  uid: string,
  alias: string,
  created: string,
  deployment: {
    id: string,
    url: string
  },
  creator: {
    uid: string,
    username: string,
    email: string
  },
  deploymentId: string,
  rules: Array<{
    pathname: string,
    method: Array<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>,
    dest: string,
  }>
}

function getSafeAlias(alias: string) {
  const _alias = alias
    .replace(/^https:\/\//i, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .toLowerCase()

  return _alias.indexOf('.') === -1
    ? `${_alias}.now.sh`
    : _alias
}

async function getPreviousAlias(now, alias): Promise<Alias | null> {
  const aliases = await now.listAliases()
  return aliases.find(a => a.alias === alias)
}

type UserAbortError = NowError<'USER_ABORT'>

async function warnAliasOverwrite(output, alias: Alias): Promise<true | UserAbortError> {
  if (isTTY) {
    const confirmed = await promptBool(chalk.bold.red('Are you sure?'))
    return !!confirmed || new NowError({ code: 'USER_ABORT' })
  } else {
    output.log(
      `Overwriting path alias with ${
        plural('rule', alias.rules.length, true)
      } to be a normal alias.`
    )
    return true
  }
}

function getScaleForDC(dc: string, deployment: Deployment): Scale {
  const dcAttrs = deployment.scale[dc] || {}
  return { min: dcAttrs.min, max: dcAttrs.max }
}

function shouldCopyScalingAttributes(origin: Deployment, dest: Deployment) {
  return getScaleForDC('bru1', origin).min !== getScaleForDC('bru1', dest).min ||
    getScaleForDC('bru1', origin).max !== getScaleForDC('bru1', dest).max ||
    getScaleForDC('sfo1', origin).min !== getScaleForDC('sfo1', dest).min ||
    getScaleForDC('sfo1', origin).max !== getScaleForDC('sfo1', dest).max
}

function formatScaleArgs(scaleArgs) {
  return Object.keys(scaleArgs).map(dc => {
    return `${chalk.bold(dc)}`
  }).join(', ')
}

async function setScale(output, now, deploymentId, scaleArgs) {
  const start = Date.now();
  const scalesMsg = formatScaleArgs(scaleArgs)
  const cancelWait = wait(`Setting scale rules for ${scalesMsg}`)

  try {
    await now.fetch(`/v3/now/deployments/${encodeURIComponent(deploymentId)}/instances`, {
      method: 'PATCH',
      body: scaleArgs
    })
    cancelWait()
  } catch (error) {
    cancelWait()
    throw error
  }

  output.success(`Scale rules for ${scalesMsg} saved ${elapsed(Date.now() - start)}`);
}

type InstancesInfo = {
  [dc: string]: {
    instances: Array<{}>
  }
}

async function getDeploymentInstances(now, deploymentId): Promise<InstancesInfo> {
  return now.fetch(`/v3/now/deployments/${encodeURIComponent(deploymentId)}/instances?init=1`)
}

function isInstanceCountBetween(value: number, min: number, max: number) {
  const safeMax = max === AUTO ? Infinity : max
  return value >= min && value <= safeMax
}

async function matchDeploymentScale(output, now, deploymentId, scale): Promise<Map<string, number>> {
  const currentInstances = await getDeploymentInstances(now, deploymentId)
  const dcsToScale = new Set(Object.keys(scale))
  const matches: Map<string, number> = new Map()

  for (const dc of dcsToScale) {
    const currentScale = currentInstances[dc]
    if (!currentScale) {
      output.debug(`Still no data for DC ${dc}`)
      break;
    }

    const currentInstancesCount = currentScale.instances.length
    const { min, max } = scale[dc]
    if (isInstanceCountBetween(currentInstancesCount, min, max)) {
      matches.set(dc, currentInstancesCount)
      output.debug(`DC ${dc} matched scale.`)
    } else {
      output.debug(`DC ${dc} missing scale. Inteded (${min}, ${max}). Current ${currentInstancesCount}`)
    }
  }

  return matches
}

function renderRemainingDCsWait(remainingDcs) {
  return wait(`Waiting for instances in ${
    Array.from(remainingDcs).map(id => chalk.bold(id)).join(', ')
  } to match constraints`)
}

async function waitForScale(output, now, deploymentId, scale) {
  const checkInterval = 500
  const timeout = ms('5m')
  const start = Date.now()
  let remainingMatches = new Set(Object.keys(scale))
  let cancelWait = renderRemainingDCsWait(remainingMatches)
  
  while (true) { // eslint-disable-line
    if (start + timeout <= Date.now()) {
      throw new Error('Timeout while verifying instance count (10m)');
    }

    // Get the matches for deployment scale args
    const matches = await matchDeploymentScale(output, now, deploymentId, scale)
    const newMatches = new Set([...remainingMatches].filter(dc => matches.has(dc)))
    remainingMatches = new Set([...remainingMatches].filter(dc => !matches.has(dc)))

    // When there are new matches we print and check if we are done
    if (newMatches.size !== 0) {
      if (cancelWait) {
        cancelWait()
      }

      // Print the new matches that we got
      for (const dc of newMatches) {
        // $FlowFixMe
        output.log(`${chalk.cyan(tick)} Scaled ${chalk.bold(dc)} (${matches.get(dc)} instance) ${elapsed(Date.now() - start)}`);
      }  

      // If we are done return, otherwise put the spinner back
      if (remainingMatches.size === 0) {
        return null
      } else {
        cancelWait = renderRemainingDCsWait(remainingMatches)
      }
    }

    // Sleep for the given interval until the next poll
    await sleep(checkInterval);
  }
}

async function getDomainStatus(now, domain) {
  return now.fetch(`/domains/status?${qs.stringify({ name: domain })}`)
}

async function getDomainPrice(now, domain) {
  return now.fetch(`/domains/price?${qs.stringify({ name: domain })}`)
}

type DomainInfo = {
  uid: string,
  creator: {
    email: string,
    uid: string,
    username: string
  },
  created: string,
  boughtAt?: string,
  expiresAt: string,
  isExternal: boolean,
  serviceType: string,
  verified: boolean,
  aliases: Array<string>,
  certs: Array<string>
}

type GetDomainErrors =
  NowError<'NO_DOMAIN_PERMISSIONS', { domain: string }>

async function getDomainInfo(now, domain): Promise<null | DomainInfo | GetDomainErrors> {
  const cancelMessage = wait(`Fetching domain info`)
  try {
    const info = await now.fetch(`/domains/${domain}`)
    cancelMessage()
    return info
  } catch (error) {
    cancelMessage()
    if (error.code === 'forbidden') {
      return new NowError({ code: 'NO_DOMAIN_PERMISSIONS', meta: { domain } })
    } else if (error.status === 404) {
      return null
    } else {
      throw error
    }
  }
}

type GetDomainServersError = 
  NowError<'NAMESERVERS_NOT_FOUND'>

async function getDomainNameservers(now, domain: string): Promise<Array<string> | GetDomainServersError> {
  const cancelFetchingMessage = wait(`Fetching DNS nameservers for ${domain}`)
  try {
    let { nameservers } = await now.fetch(`/whois-ns?domain=${encodeURIComponent(domain)}`)
    cancelFetchingMessage()
    return nameservers.filter(ns => {
      // Temporary hack:
      // sometimes we get a response that looks like:
      // ['ns', 'ns', '', '']
      // so we filter the empty ones
      return ns.length > 0
    })
  } catch (error) {
    cancelFetchingMessage()
    if (error.status === 404) {
      return new NowError({ code: 'NAMESERVERS_NOT_FOUND' })
    } else {
      throw error
    }
  }
}

type BuyDomainErrors =
  NowError<'SOURCE_NOT_FOUND', { domain: string }>

async function purchaseDomain(output, now, domain): Promise<null | BuyDomainErrors> {
  const purchaseStamp = stamp()
  const cancelWait = wait('Purchasing')
  try {
    const { uid } = await now.fetch('/domains/buy', {
      body: { name: domain },
      method: 'POST'
    })
    cancelWait()
    output.log(`Domain purchased and created ${chalk.gray(`(${uid})`)} ${purchaseStamp()}`)
  } catch (error) {
    cancelWait()
    if (error.code === 'source_not_found') {
      return new NowError({ code: 'SOURCE_NOT_FOUND', meta: { domain } })
    } else {
      throw error
    }
  }

  return null
}

async function purchaseDomainIfAvailable(output, now, domain, contextName): Promise<boolean | BuyDomainErrors> {
  const cancelWait = wait(`Checking status of ${chalk.bold(domain)}`)
  const buyDomainStamp = stamp()
  const { available } = await getDomainStatus(now, domain)
  
  if (available) {
    const { price, period } = await getDomainPrice(now, domain)
    cancelWait()
    output.log(
      `The domain ${domain} is ${chalk.italic('available')} to buy under ${
        chalk.bold(contextName)
      }! ${buyDomainStamp()}`
    )

    if (!await promptBool(`Buy now for ${chalk.bold(`$${price}`)} (${plural('yr', period, true)})?`)) {
      output.print(eraseLines(1))
      return new NowError({ code: 'USER_ABORT' })
    }

    output.print(eraseLines(1))
    const result = await purchaseDomain(output, now, domain)
    if (result instanceof NowError) {
      return result
    }

    return true
  } else {
    cancelWait()
    return false
  }
}

async function domainResolvesToNow(output, alias, retryConfig = {}): Promise<boolean> {
  output.debug(`Checking if ${alias} resolves to now`)
  const cancelMessage = wait(`Checking ${alias} DNS resolution`)
  let response
  try {
    response = await retry(async () => {
      return fetch(`http://${alias}`, {
        method: 'HEAD',
        redirect: 'manual'
      })
    }, { retries: 2, maxTimeout: 8000, ...retryConfig })
    cancelMessage()
  } catch (error) {
    cancelMessage()
    if (error.code === 'ENOTFOUND') {
      return false
    } else {
      throw error
    }
  }

  return response.headers.get('server') === 'now'
}

type VerifyDomainErrors =
  NowError<'NEED_UPGRADE'> |
  NowError<'DOMAIN_PERMISSION_DENIED'> |
  NowError<'DOMAIN_IS_NOT_VERIFIED', { domain: string }> |
  NowError<'DOMAIN_VERIFICATION_FAILED', { domain: string, subdomain: string, token: string }>

async function verifyDomain(now, alias, { isExternal = false } = {}): Promise<boolean | VerifyDomainErrors> {
  const cancelMessage = wait('Setting up and verifying the domain')
  const { domain, subdomain } = psl.parse(alias)
  try {
    const { verified } = await retry(async (bail) => {
      try {
        return await now.fetch('/domains', {
          body: { name: domain, isExternal },
          method: 'POST',
        })
      } catch (err) {
        // retry in case the user has to setup a TXT record
        if (err.code !== 'verification_failed') {
          bail(err)
        } else {
          throw err
        }
      }
    }, { retries: 5, maxTimeout: 8000 })
    cancelMessage()

    if (verified === false) {
      return new NowError({
        code: 'DOMAIN_IS_NOT_VERIFIED',
        meta: { domain },
      })
    }

    return verified
  } catch (error) {
    cancelMessage()
    if (error.status === 403) {
      return error.code === 'custom_domain_needs_upgrade'
        ? new NowError({ code: 'NEED_UPGRADE' })
        : new NowError({ code: 'DOMAIN_PERMISSION_DENIED' })
    }

    if (error.status === 401 && error.code === 'verification_failed') {
      return new NowError({
        code: 'DOMAIN_VERIFICATION_FAILED',
        meta: { subdomain, domain, token: error.verifyToken },
      })
    }

    if (error.status !== 409) {
      // we can ignore the 409 errors since it means the domain
      // is already setup
      throw error
    }
  }

  return true
}

type SetupDNSRecordError =
  NowError<'DNS_ACCESS_UNAUTHORIZED'>

async function setupDNSRecord(output, now, type, name, domain): Promise<null | SetupDNSRecordError> {
  output.debug(`Trying to setup ${type} record with name ${name} for domain ${domain}`)
  try {
    await now.fetch(`/domains/${domain}/records`, {
      body: { type, name, value: 'alias.zeit.co' },
      method: 'POST'
    })
  } catch (error) {
    console.log('THERE WAS ERROR', error)

    if (error.status === 403) {
      return new NowError({ code: 'DNS_ACCESS_UNAUTHORIZED' })
    }

    if (error.status !== 409) {
      // ignore the record conflict to make it idempotent
      throw error
    }
  }

  return null
}

async function setupDNSRecords(output, now, alias, domain): Promise<true | SetupDNSRecordError> {
  const cnameResult = await setupDNSRecord(output, now, 'CNAME', '*', domain)
  if (cnameResult instanceof NowError) {
    return cnameResult
  }

  const aliasResult = await setupDNSRecord(output, now, 'ALIAS', '', domain)
  if (aliasResult instanceof NowError) {
    return aliasResult
  }

  return true
}

type SetupAliasDomainError =
  GetDomainErrors |
  BuyDomainErrors |
  VerifyDomainErrors |
  GetDomainServersError |
  UserAbortError |
  SetupDNSRecordError

async function setupAliasDomain(output, now, alias, contextName): Promise<true | SetupAliasDomainError> {
  const { subdomain, domain } = psl.parse(alias)

  // In case the domain is avilable, we have to purchase
  const purchased = await purchaseDomainIfAvailable(output, now, domain, contextName)
  if (purchased instanceof NowError) {
    return purchased
  }

  // Now the domain shouldn't be available and it might or might not belong to the user
  const info = await getDomainInfo(now, domain)
  if (info instanceof NowError) {
    return info
  }

  if (!info) {

    // If we have no info it means that it's an unknown domain. We have to check the
    // nameservers to register and verify it as an external or non-external domain
    const nameservers = await getDomainNameservers(now, domain)
    if (nameservers instanceof NowError) {
      return nameservers
    }

    output.log(
      `Nameservers: ${nameservers && nameservers.length
        ? nameservers.map(ns => chalk.underline(ns)).join(', ')
        : chalk.dim('none')}`
    )

    if (!nameservers.every(ns => ns.endsWith('.zeit.world'))) {
      // If it doesn't have the nameserver pointing to now we have to create the 
      // domain knowing that it should be verified via a DNS TXT record.
      const setupResult = await verifyDomain(now, alias, { isExternal: true })
      if (setupResult instanceof NowError) {
        return setupResult
      } else {
        output.success(`Domain ${domain} added!`)
      }

      // The domain is verified and added so if alias doesn't resolve to now 
      // it means that the user has to configure the CNAME, the ALIAS or to 
      // change the nameservers or wait for propagation.
      if (!await domainResolvesToNow(output, alias, { retries: 5 })) {
        return new NowError({
          code: 'UNABLE_TO_RESOLVE_EXTERNAL',
          meta: { domain, subdomain }
        })
      }
    } else {
      // We have to create the domain knowing that the nameservers are zeit.world
      output.log(`Detected ${chalk.bold(chalk.underline('zeit.world'))} nameservers! Setting up domain...`)
      const setupResult = await verifyDomain(now, alias, { isExternal: false })
      if (setupResult instanceof NowError) {
        return setupResult
      } else {
        output.success(`Domain ${domain} added!`)
      }

      // Since it's pointing to our nameservers we can configure the DNS records
      const result = await setupDNSRecords(output, now, alias, domain)
      if (result instanceof NowError) {
        return result
      }

      // If it doesn't resolve here it means that everything is setup but the
      // propagation is not done so we invite the user to try later.
      output.log(`DNS Configured! Verifying propagation…`)
      if (!await domainResolvesToNow(output, alias, { retries: 10 })) {
        return new NowError({ code: 'UNABLE_TO_RESOLVE_INTERNAL' })
      }
    }
  } else {
    // If we have records from the domain we have to try to verify in case it is not
    // verified and from this point we can be sure about its verification
    if (!info.verified) {
      const verified = await verifyDomain(now, alias, { isExternal: info.isExternal })
        if (verified instanceof NowError) {
          return verified
        }
    }

    if (info.isExternal) {
      // If the domain is external and verified the user had to configure
      // the CNAME, the ALIAS or to change the nameservers or wait a little.
      if (!await domainResolvesToNow(output, alias, { retries: 5 })) {
        return new NowError({
          code: 'UNABLE_TO_RESOLVE_EXTERNAL',
          meta: { domain, subdomain }
        })
      }
    } else {
      // If the domain is an internal domain it means that it's pointing to zeit.world and
      // we can configure the DNS records in case it is not resolving properly.
      if (!await domainResolvesToNow(output, alias)) {
        const result = await setupDNSRecords(output, now, alias, domain)
        if (result instanceof NowError) {
          return result
        }
        
        // Verify that the DNS records are ready
        output.log(`DNS Configured! Verifying propagation…`)
        if (!await domainResolvesToNow(output, alias, { retries: 10 })) {
          return new NowError({ code: 'UNABLE_TO_RESOLVE_INTERNAL' })
        }
      }
    }
  }

  return true
}

type Certificate = {
  uid: string,
  created: string,
  expiration: string,
  autoRenew: boolean,
  cns: Array<string>
}

async function createCertificate(now, cns): Promise<Certificate> {
  const cancelMessage = wait(`Generating a certificate...`)
  const certificate = await retry(async (bail) => {
    try {
      return await now.fetch('/v3/now/certs', {
        method: 'POST',
        body: { domains: cns },
      })
    } catch (error) {
      if (error.code !== 'configuration_error') {
        bail(error)
      } else {
        throw error
      }
    }
  }, { retries: 3, minTimeout: 30000, maxTimeout: 90000 })
  cancelMessage()
  return certificate
}

type AliasRecord = {
  uid: string,
  alias: string,
  created?: string
}

type CreateAliasError = 
  NowError<'ALIAS_IN_USE'> |
  NowError<'DEPLOYMENT_NOT_FOUND', { id: string }> |
  NowError<'INVALID_ALIAS'> |
  NowError<'NEED_UPGRADE'> |
  NowError<'NO_DOMAIN_PERMISSIONS'>

async function createAlias(output, now, deployment, alias): Promise<AliasRecord | CreateAliasError> {
  const cancelMessage = wait(`Creating alias`)
  const { domain } = psl.parse(alias)

  try {
    const data = await now.fetch(`/now/deployments/${deployment.uid}/aliases`, {
      method: 'POST',
      body: { alias }
    })

    cancelMessage()
    return data
  } catch (error) {
    cancelMessage()
    
    // If the certificate is missing we create it without expecting failures
    // then we call back the createAlias function
    if (error.code === 'cert_missing' || error.code === 'cert_expired') {
      const cns = USE_WILDCARD_CERTS ? [domain, `*.${domain}`] : [alias]
      await createCertificate(now, cns)
      output.success(`Certificate for ${alias} successfuly created`)
      return createAlias(output, now, deployment, alias)
    }

    // The alias already exists so we fail in silence returning the id
    if (error.status === 409) {
      const record: AliasRecord = { uid: error.uid, alias: error.alias }
      return record
    }

    if (error.code === 'deployment_not_found') {
      return new NowError({
        code: 'DEPLOYMENT_NOT_FOUND',
        meta: { id: deployment.uid }
      })
    }

    // We do not support nested subdomains
    if (error.code === 'invalid_alias') {
      return new NowError({ code: 'INVALID_ALIAS' })
    }

    if (error.status === 403) {
      if (error.code === 'custom_domain_needs_upgrade') {
        return new NowError({ code: 'NEED_UPGRADE' })
      }

      if (error.code === 'alias_in_use') {
        return new NowError({ code: 'ALIAS_IN_USE' })
      }

      if (error.code === 'forbidden') {
        return new NowError({ code: 'NO_DOMAIN_PERMISSIONS', meta: { domain } })
      }
    }

    throw error
  }
}

async function fetchDeploymentFromAlias(output, now, contextName, prevAlias): Promise<Deployment | null | FetchDeploymentErrors> {
  return prevAlias
    ? fetchDeployment(output, now, contextName, prevAlias.deploymentId)
    : null
}

function shouldDownscaleDeployment(deployment: Deployment): boolean {
  return Object.keys(deployment.scale).reduce((result, dc) => {
    return result || getScaleForDC(dc, deployment).min !== 0 ||
      getScaleForDC(dc, deployment).max !== 1
  }, false)
}

function getDownscalePresets(deployment: Deployment): DeploymentScale {
  return Object.keys(deployment.scale).reduce((result, dc) => {
    return Object.assign(result, {
      [dc]: { min: 0, max: 1 }
    })
  }, {})
}

type AssignAliasError =
  CreateAliasError |
  FetchDeploymentErrors |
  SetupAliasDomainError

async function assignAlias(output, now, deployment: Deployment, alias: string, contextName): Promise<true | AssignAliasError> {
  output.log(`Asigning alias ${alias} to deployment ${deployment.url}`)
  const prevAlias = await getPreviousAlias(now, getSafeAlias(alias))
  
  // Ask for a confirmation if there are rules defined
  if (prevAlias && prevAlias.rules) {
    await warnAliasOverwrite(output, prevAlias)
  }

  // If there was a previous deployment, we should fetch it to scale and downscale later
  const prevDeployment = await fetchDeploymentFromAlias(output, now, contextName, prevAlias)
  if (prevDeployment instanceof NowError) {
    return prevDeployment
  }

  // If there was a prev deployment we have to check if we should scale
  if (prevDeployment !== null && shouldCopyScalingAttributes(prevDeployment, deployment)) {
    await setScale(output, now, deployment.uid, prevDeployment.scale)
    await waitForScale(output, now, deployment.uid, prevDeployment.scale)
  } else {
    output.debug(`Both deployments have the same scaling rules.`)
  }

  // Check if the alias is a custom domain and if case we have a positive
  // we have to configure the DNS records and certificate
  if (!/\.now\.sh$/.test(alias)) {
    output.log(`${chalk.bold(chalk.underline(alias))} is a custom domain.`)
    const result = await setupAliasDomain(output, now, alias, contextName)
    if (result instanceof NowError) {
      return result
    }
  }

  // Create the alias and the certificate if it's missing
  const aliased = await createAlias(output, now, deployment, alias)
  if (aliased instanceof NowError) {
    return aliased
  }
  
  // Downscale if the previous deployment doesn't have the minimal presets
  if (prevDeployment !== null && shouldDownscaleDeployment(prevDeployment)) {
    await setScale(output, now, prevDeployment.uid, getDownscalePresets(prevDeployment))
    output.success(`Previous deployment ${prevDeployment.url} downscaled`);
  }

  return true
}
