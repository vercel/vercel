// @flow

// Packages
const chalk = require('chalk')
const arg = require('arg')
const table = require('text-table')
const ms = require('ms')
const fs = require('fs-extra')
const plural = require('pluralize')
const {resolve, basename} = require('path');

// Utilities
const strlen = require('../util/strlen')
const Now = require('../util/')
const NowAlias = require('../util/alias')
const cmd = require('../../../util/output/cmd')
const createOutput = require('../../../util/output')
const argCommon = require('../util/arg-common')()
const wait = require('../../../util/output/wait')
const { handleError } = require('../util/error')
const toHost = require('../util/to-host')
const logo = require('../../../util/output/logo')
const elapsed = require('../../../util/output/elapsed')
const promptBool = require('../../../util/input/prompt-bool')
const getContextName = require('../util/get-context-name')
const isValidDomain = require('../util/domains/is-valid-domain')

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
  const args = argv._.slice(1)

  switch (subcommand) {
    case 'ls':
    case 'list':
      return ls(ctx, argv, args, output);
    case 'rm':
    case 'remove':
      return rm(ctx, argv, args, output);
    case 'set':
      return set(ctx, argv, ['set', ...args], output);
    // default to set, and populate it to emulate it as one of the args
    default:
      return set(ctx, argv, ['set', ...args], output);
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
  const { log, warn, error, debug } = output;
  if (args.length > 2) {
    error(`${cmd('now alias <deployment> <target>')} accepts at most two arguments`);
    return 1;
  }

  // deployment id and target alias
  let [id, target] = args;
  let targets = [target]

  // set up the context
  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')
  const { user, currentTeam } = sh;
  const contextName = getContextName(sh);
  const { apiUrl } = ctx;
  const { ['--debug']: debugEnabled } = opts;
  const now = new Now({ apiUrl, token, debug: debugEnabled, currentTeam })

  // we will attempt to fetch the deployment based on the
  // current directory, if applicalbe
  let deployment;

  // there's a chance that the user did `now alias <target>`
  // directly, because he is in a directory
  // note: this entire branch will be deprecated soon
  if (id != null && target == null) {
    debug(`only got one argument, assuming ${id} is the target`);
    target = id;
    targets = [target];
    id = null;
  }

  // if both are null, we attempt to determine if we are in a
  // deployment directory
  // note: this entire branch will be deprecated soon
  if (id == null) {
    debug('no known deployment id, attempting to get it from current directory');
    const cfg = await maybeGetDeploymentConfig(process.cwd(), opts['--local-config']);
    if (cfg) {
      const aliases = cfg.aliases || cfg.alias;

      if (cfg.aliases) {
        warn('The `aliases` field has been deprecated in favor of `alias`');
      }

      if (!aliases) {
        error('Attempted to alias the deployment in the current directory, but no `alias` found in config');
        help();
        now.close();
        return 1;
      }

      if (aliases && typeof aliases !== 'string' && !Array.isArray(aliases)) {
        error('Attempted to alias deployment, but the `alias` config is neither a string nor an array');
        now.close();
        return 1;
      }

      if (!aliases.length) {
        error('Attempted to alias deployment, but the `alias` config is empty');
        now.close();
        return 1;
      }

      targets = Array.from(aliases);

      const appName = cfg.name || basename(resolve(process.cwd(), opts['--local-config'] || ''));
      debug(`will look for deployments matching app ${appName}`);
      const deployments = await now.list(appName, { version: 3 });

      // we select as a candidate the latest deployment of the same name
      // as the current project / directory, deployed
      deployment = deployments
        .sort(sortRecent())
        .filter(dep => dep.state === 'READY' && dep.creator.uid === user.uid)[0]

      if (deployment) {
        debug(`deployment found "${deployment.url}"`);
        id = deployment.id;
      } else {
        debug(`no deployment found matching app ${appName}`);
        help();
        now.close();
        return 1;
      }
    } else {
      error(`${cmd('now alias')} requires two arguments or to be run in a deployment with \`alias\` config`);
      help();
      now.close();
      return 1;
    }
  }

  // validate targets
  // note: we have multiple targets because of the config. for now,
  // CLI users can only set one target
  for (const target of targets) {
    if (!isValidDomain(target)) {
      error(`The target alias domain "${target}" is not valid`);
      now.close();
      return 1;
    }
  }

  // only fetch the deployment if we got it as a parameter,
  // and we didn't guess it based on the local directory
  if (!deployment) {
    const depFetchStart = Date.now();
    const cancelWait = wait(`Fetching deployment "${id}" in ${chalk.bold(contextName)}`);

    try {
      deployment = await now.findDeployment(id)
      cancelWait();
    } catch (err) {
      cancelWait();
      now.close();

      if (err.status === 404) {
        error(`Failed to find deployment "${id}" in ${chalk.bold(contextName)}`)
        return 1;
      } else if (err.status === 403) {
        error(`No permission to access deployment "${id}" in ${chalk.bold(contextName)}`)
        return 1;
      } else {
        // unexpected
        throw err;
      }
    }

    log(`Found deployment "${deployment.url}" in ${chalk.bold(contextName)} ${elapsed(Date.now() - depFetchStart)}`);
  }

  if (id == null && !opts['--rules']) {
    error(`Invalid number of arguments. Usage: ${cmd('`now alias set <deployment> <domain>`')}`)
    help();
    now.close();
    return 1;
  }

  // attempt the alias directly
  log('will alias')

  now.close();
  return 0
}

async function maybeGetDeploymentConfig (path, configFile) {
  const read = async (file) => {
    if (await fs.exists(file)) {
      return JSON.parse(await fs.readFile(file));
    } else {
      return null;
    }
  }

  // if the config file is supplied by the user
  // via --local-config
  if (configFile) {
    return read(resolve(path, configFile));
  } else {
    const mainConfig = await read(resolve(path, 'now.json'));
    if (mainConfig) return mainConfig;
    const pkg = await read(resolve(path, 'package.json'));
    return pkg ? pkg.now || null : null;
  }
}

//async function updatePathAlias(alias, aliasName, rules, domains, output) {
  //const start = new Date()
  //const res = await alias.updatePathBasedroutes(
    //String(aliasName),
    //rules,
    //domains
  //)
  //const elapsed = ms(new Date() - start)
  //if (res.error) {
    //throw responseError(res);
  //} else {
    //output.success(
      //`${res.ruleCount} rules configured for ${chalk.underline(
        //res.alias
      //)} [${elapsed}]`
    //)
  //}
//}

// sorts by most recent deployment
function sortRecent() {
  return function recencySort(a, b) {
    return b.created - a.created;
  }
}
