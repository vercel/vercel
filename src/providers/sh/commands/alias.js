// @flow

// Packages
const chalk = require('chalk')
const arg = require('arg')
const table = require('text-table')
const ms = require('ms')
const plural = require('pluralize')

// Utilities
const strlen = require('../util/strlen')
const NowAlias = require('../util/alias')
const NowDomains = require('../util/domains')
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
const { responseError } = require('../util/error')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now alias`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls    [app]                  Show all aliases (or per app name)
    set   <deployment> <alias>   Create a new alias
    rm    <id>                   Remove an alias using its ID

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
    case 'list': {
      return ls(ctx, argv, args, output);
    }
    case 'rm':
    case 'remove': {
      return rm(ctx, argv, args, output);
    }
    default:
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
                    rule.pathname ? rule.pathname : '',
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

  console.log('')

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
    ).replace(/^/gm, '  ') + '\n'
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
    error(`${cmd('now alias rm <id>')} expects one argument`)
    return 1
  }

  if (args.length !== 1) {
    error(
      `Invalid number of arguments. Usage: ${chalk.cyan(
        '`now alias rm <id>`'
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
  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')
  const { user, currentTeam } = sh;
  // const contextName = getContextName(sh);

  const { error } = output;
  const { apiUrl } = ctx;
  const { ['--debug']: debugEnabled } = opts;

  const alias = new NowAlias({ apiUrl, token, debug: debugEnabled, currentTeam })
  const domains = new NowDomains({ apiUrl, token, debug: debugEnabled, currentTeam })

  if (opts['--rules']) {
    await updatePathAlias(alias, args[0], opts['--rules'], domains, output)
    return 0
  }

  if (args.length !== 2) {
    error(
      `Invalid number of arguments. Usage: ${cmd(
        '`now alias set <id> <domain>`'
      )}`
    )
    return 1;
  }

  await alias.set(
    String(args[0]),
    String(args[1]),
    domains,
    currentTeam,
    user
  )

  alias.close();
  domains.close();

  return 0
}

async function updatePathAlias(alias, aliasName, rules, domains, output) {
  const start = new Date()
  const res = await alias.updatePathBasedroutes(
    String(aliasName),
    rules,
    domains
  )
  const elapsed = ms(new Date() - start)
  if (res.error) {
    throw responseError(res);
  } else {
    output.success(
      `${res.ruleCount} rules configured for ${chalk.underline(
        res.alias
      )} [${elapsed}]`
    )
  }
}
