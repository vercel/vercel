// @flow

// Packages
const arg = require('arg')
const chalk = require('chalk')
const fs = require('fs-extra')
const ms = require('ms')
const path = require('path');
const plural = require('pluralize')
const table = require('text-table')

// Utilities
const { handleError } = require('../util/error')
const argCommon = require('../util/arg-common')()
const cmd = require('../../../util/output/cmd')
const createOutput = require('../../../util/output')
const elapsed = require('../../../util/output/elapsed')
const getContextName = require('../util/get-context-name')
const humanizePath = require('../../../util/humanize-path')
const isValidDomain = require('../util/domains/is-valid-domain')
const logo = require('../../../util/output/logo')
const Now = require('../util/')
const NowAlias = require('../util/alias')
const promptBool = require('../../../util/input/prompt-bool')
const strlen = require('../util/strlen')
const toHost = require('../util/to-host')
const wait = require('../../../util/output/wait')

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

async function confirmDeploymentRemoval(alias, _alias) {
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
    const item = list.find(
      e => e.uid === args[0] || e.alias === args[0]
    )
    if (!item || !item.rules) {
      error(`Could not match path alias for: ${args[1]}`)
      alias.close();
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
    alias.close();
    return 0;
  } else if (args.length !== 0) {
    error(`Invalid number of arguments. Usage: ${chalk.cyan('`now alias ls`')}`)
    alias.close();
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

  print(
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

  const {success, log, error} = output;
  const { apiUrl } = ctx;
  const { ['--debug']: debugEnabled } = opts;

  const alias = new NowAlias({ apiUrl, token, debug: debugEnabled, currentTeam })

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

  const _aliases = await alias.ls()
  const _alias = findAlias(_target, _aliases, output)

  if (!_alias) {
    error(
      `Alias not found by "${_target}" under ${chalk.bold(contextName)}.
      Run ${cmd('`now alias ls`')} to see your aliases.`
    )
    return 1;
  }

  try {
    const confirmation = opts['--yes'] ||
      await confirmDeploymentRemoval(alias, _alias)

    if (!confirmation) {
      log('Aborted')
      alias.close();
      return 0
    }

    const start = new Date()
    await alias.rm(_alias)
    const elapsed = ms(new Date() - start)
    success(
      `Alias ${chalk.bold(
        _alias.alias
      )} removed [${elapsed}]`
    )
  } catch (err) {
    error(err)
    alias.close();
    return 1
  }

  alias.close();
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
    now.close()
    return 1
  }

  // Now we are sure we have values for deployment and targets
  const { deployment, targets } = params

  // Validate the resolved targets
  const targetError = targetsAreValid(targets)
  if (targetError instanceof NowError) {
    output.error(`Invalid target ${targetError.meta.target}`);
    now.close()
    return 1
  }

  console.log({ deployment, targets })
  now.close();
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

type Deployment = {
  uid: string,
  url: string,
  name: string,
  created: number,
  creator: { uid: string, },
  state: 'FROZEN' | 'READY',
  type: 'NPM',
}

async function getAppLastDeployment(output, now, appName, user, contextName): Promise<Deployment | null> {
  output.debug(`Looking for deployments matching app ${appName}`)
  const cancelWait = wait(`Fetching user deployments in ${chalk.bold(contextName)}`);
  const deployments: Array<Deployment> = await now.list(appName, { version: 3 });
  cancelWait()
  return deployments
    .sort((a, b) => b.created - a.created)
    .filter(dep => dep.state === 'READY' && dep.creator.uid === user.uid)[0]
}

type FetchDeploymentErrors =
  NowError<'DEPLOYMENT_NOT_FOUND', { id: string }> |
  NowError<'DEPLOYMENT_PERMISSION_DENIED', { id: string }>

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

type SetAliasArgs = {
  deployment: Deployment,
  targets: Array<string>,
}

type SetAliasErrors = 
  NowError<'CANT_FIND_DEPLOYMENT'> |
  NowError<'TOO_MANY_ARGS'> |
  GetInferredTargetsError | 
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
    const deployment = await getAppLastDeployment(output, now, appName, user)
    return !deployment 
      ? new NowError({ code: 'CANT_FIND_A_DEPLOYMENT' })
      : { deployment, targets }
  }

  // When there is one arg we assume the user typed `now alias <target> because
  // he is in the app directory so we can infer the deployment
  if (args.length === 1) {
    const targets = [args[0]]
    const appName = await getAppName(output, opts)
    const deployment = await getAppLastDeployment(output, now, appName, user)
    return !deployment
      ? new NowError({ code: 'CANT_FIND_A_DEPLOYMENT' })
      : { deployment, targets }
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
    if (!isValidDomain(target)) {
      return new NowError({
        code: 'INVALID_TARGET_DOMAIN',
        meta: { target }
      })
    }
  }

  return targets
}
