#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const minimist = require('minimist')
const table = require('text-table')
const ms = require('ms')

// Ours
const strlen = require('../lib/strlen')
const NowAlias = require('../lib/alias')
const NowDomains = require('../lib/domains')
const login = require('../lib/login')
const cfg = require('../lib/cfg')
const { error } = require('../lib/error')
const toHost = require('../lib/to-host')
const { reAlias } = require('../lib/re-alias')
const exit = require('../lib/utils/exit')
const logo = require('../lib/utils/output/logo')
const promptBool = require('../lib/utils/input/prompt-bool')

const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token', 'rules'],
  boolean: ['help', 'debug'],
  alias: {
    help: 'h',
    config: 'c',
    rules: 'r',
    debug: 'd',
    token: 't'
  }
})

const subcommand = argv._[0]

// Options
const help = () => {
  console.log(
    `
  ${chalk.bold(`${logo} now alias`)} <ls | set | rm> <deployment> <alias>

  ${chalk.dim('Options:')}

    -h, --help                         Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}             Config file
    -r ${chalk.bold.underline('RULES_FILE')}, --rules=${chalk.bold.underline('RULES_FILE')}  Rules file
    -d, --debug                        Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')}            Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Lists all your aliases:

      ${chalk.cyan('$ now alias ls')}

  ${chalk.gray('–')} Adds a new alias to ${chalk.underline('my-api.now.sh')}:

      ${chalk.cyan(`$ now alias set ${chalk.underline('api-ownv3nc9f8.now.sh')} ${chalk.underline('my-api.now.sh')}`)}

      The ${chalk.dim('`.now.sh`')} suffix can be ommited:

      ${chalk.cyan('$ now alias set api-ownv3nc9f8 my-api')}

      The deployment id can be used as the source:

      ${chalk.cyan('$ now alias set deploymentId my-alias')}

      Custom domains work as alias targets:

      ${chalk.cyan(`$ now alias set ${chalk.underline('api-ownv3nc9f8.now.sh')} ${chalk.underline('my-api.com')}`)}

      ${chalk.dim('–')} The subcommand ${chalk.dim('`set`')} is the default and can be skipped.
      ${chalk.dim('–')} ${chalk.dim('`http(s)://`')} in the URLs is unneeded / ignored.

  ${chalk.gray('–')} Add and modify path based aliases for ${chalk.underline('zeit.ninja')}:

      ${chalk.cyan(`$ now alias ${chalk.underline('zeit.ninja')} -r ${chalk.underline('rules.json')}`)}

      Export effective routing rules:

      ${chalk.cyan(`$ now alias ls aliasId --json > ${chalk.underline('rules.json')}`)}

      ${chalk.cyan(`$ now alias ls zeit.ninja`)}

  ${chalk.gray('–')} Removing an alias:

      ${chalk.cyan('$ now alias rm aliasId')}

      To get the list of alias ids, use ${chalk.dim('`now alias ls`')}.

  ${chalk.dim('Alias:')} ln
`
  )
}

// Options
const debug = argv.debug
const apiUrl = argv.url || 'https://api.zeit.co'

if (argv.config) {
  cfg.setConfigFile(argv.config)
}

if (argv.help) {
  help()
  exit(0)
} else {
  Promise.resolve().then(async () => {
    const config = await cfg.read()

    let token
    try {
      token = argv.token || config.token || (await login(apiUrl))
    } catch (err) {
      error(`Authentication error – ${err.message}`)
      exit(1)
    }

    try {
      await run({ token, config })
    } catch (err) {
      if (err.userError) {
        error(err.message)
      } else {
        error(`Unknown error: ${err}\n${err.stack}`)
      }
      exit(1)
    }
  })
}

async function run({ token, config: { currentTeam, user } }) {
  const alias = new NowAlias({ apiUrl, token, debug, currentTeam })
  const domains = new NowDomains({ apiUrl, token, debug, currentTeam })
  const args = argv._.slice(1)

  switch (subcommand) {
    case 'ls':
    case 'list': {
      if (args.length === 1) {
        const list = await alias.listAliases()
        const item = list.find(
          e => e.uid === argv._[1] || e.alias === argv._[1]
        )
        if (!item || !item.rules) {
          error(`Could not match path alias for: ${argv._[1]}`)
          return exit(1)
        }

        if (argv.json) {
          console.log(JSON.stringify({ rules: item.rules }, null, 2))
        } else {
          const header = [
            ['', 'pathname', 'method', 'dest'].map(s => chalk.dim(s))
          ]
          const text = list.length === 0
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

          console.log(text)
        }
        break
      } else if (args.length !== 0) {
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan('`now alias ls`')}`
        )
        return exit(1)
      }

      const start_ = new Date()
      const list = await alias.list()
      const urls = new Map(list.map(l => [l.uid, l.url]))
      const aliases = await alias.ls()
      aliases.sort((a, b) => new Date(b.created) - new Date(a.created))
      const current = new Date()

      const header = [
        ['', 'id', 'source', 'url', 'created'].map(s => chalk.dim(s))
      ]
      const text = list.length === 0
        ? null
        : table(
            header.concat(
              aliases.map(_alias => {
                const _url = chalk.underline(`https://${_alias.alias}`)
                const target = _alias.deploymentId
                let _sourceUrl
                if (urls.get(target)) {
                  _sourceUrl = chalk.underline(`https://${urls.get(target)}`)
                } else if (_alias.rules) {
                  _sourceUrl = chalk.gray(
                    `[${_alias.rules.length} custom rule${_alias.rules.length > 1 ? 's' : ''}]`
                  )
                } else {
                  _sourceUrl = chalk.gray('<null>')
                }

                const time = chalk.gray(
                  ms(current - new Date(_alias.created)) + ' ago'
                )
                return [
                  '',
                  // We default to `''` because some early aliases didn't
                  // have an uid associated
                  _alias.uid === null ? '' : _alias.uid,
                  _sourceUrl,
                  _url,
                  time
                ]
              })
            ),
            {
              align: ['l', 'r', 'l', 'l'],
              hsep: ' '.repeat(2),
              stringLength: strlen
            }
          )

      const elapsed_ = ms(new Date() - start_)
      console.log(
        `> ${aliases.length} alias${aliases.length === 1 ? '' : 'es'} found ${chalk.gray(`[${elapsed_}]`)} under ${chalk.bold((currentTeam && currentTeam.slug) || user.username || user.email)}`
      )

      if (text) {
        console.log('\n' + text + '\n')
      }

      break
    }
    case 'rm':
    case 'remove': {
      const _target = String(args[0])
      if (!_target) {
        const err = new Error('No alias id specified')
        err.userError = true
        throw err
      }

      if (args.length !== 1) {
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan('`now alias rm <id>`')}`
        )
        return exit(1)
      }

      const _aliases = await alias.ls()
      const _alias = findAlias(_target, _aliases)

      if (!_alias) {
        const err = new Error(
          `Alias not found by "${_target}" under ${chalk.bold((currentTeam && currentTeam.slug) || user.username || user.email)}. Run ${chalk.dim('`now alias ls`')} to see your aliases.`
        )
        err.userError = true
        throw err
      }

      try {
        const confirmation = await confirmDeploymentRemoval(alias, _alias)
        if (!confirmation) {
          console.log('\n> Aborted')
          process.exit(0)
        }

        const start = new Date()
        await alias.rm(_alias)
        const elapsed = ms(new Date() - start)
        console.log(
          `${chalk.cyan('> Success!')} Alias ${chalk.bold(_alias.uid)} removed [${elapsed}]`
        )
      } catch (err) {
        error(err)
        exit(1)
      }

      break
    }
    case 'add':
    case 'set': {
      if (argv.rules) {
        await updatePathAlias(alias, argv._[0], argv.rules, domains)
        break
      }
      if (args.length !== 2) {
        error(
          `Invalid number of arguments. Usage: ${chalk.cyan('`now alias set <id> <domain>`')}`
        )
        return exit(1)
      }
      await alias.set(String(args[0]), String(args[1]), currentTeam, user)
      break
    }
    default: {
      if (argv._.length === 0) {
        await reAlias(token, null, null, help, exit, apiUrl, debug, alias)
        break
      }

      if (argv._.length === 1) {
        await reAlias(
          token,
          null,
          String(argv._[0]),
          help,
          exit,
          apiUrl,
          debug,
          alias
        )
        break
      }

      if (argv.rules) {
        await updatePathAlias(alias, argv._[0], argv.rules, domains)
      } else if (argv._.length === 2) {
        await alias.set(
          String(argv._[0]),
          String(argv._[1]),
          domains,
          currentTeam,
          user
        )
      } else if (argv._.length >= 3) {
        error('Invalid number of arguments')
        help()
        exit(1)
      } else {
        error('Please specify a valid subcommand: ls | set | rm')
        help()
        exit(1)
      }
    }
  }

  domains.close()
  alias.close()
}

async function confirmDeploymentRemoval(alias, _alias) {
  const deploymentsList = await alias.list()
  const urls = new Map(deploymentsList.map(l => [l.uid, l.url]))

  const time = chalk.gray(ms(new Date() - new Date(_alias.created)) + ' ago')
  const _sourceUrl = chalk.underline(`https://${urls.get(_alias.deploymentId)}`)
  const tbl = table(
    [
      [_alias.uid, _sourceUrl, chalk.underline(`https://${_alias.alias}`), time]
    ],
    { align: ['l', 'r', 'l'], hsep: ' '.repeat(6) }
  )

  const msg =
    '> The following alias will be removed permanently\n' +
    `  ${tbl} \nAre you sure?`

  return promptBool(msg, {
    trailing: '\n'
  })
}

function findAlias(alias, list) {
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
      if (debug) {
        console.log(`> [debug] matched alias ${d.uid} by ${key} ${val}`)
      }

      return true
    }

    // Match prefix
    if (`${val}.now.sh` === d.alias) {
      if (debug) {
        console.log(`> [debug] matched alias ${d.uid} by url ${d.host}`)
      }

      return true
    }

    return false
  })

  return _alias
}

async function updatePathAlias(alias, aliasName, rules, domains) {
  const start = new Date()
  const res = await alias.updatePathBasedroutes(
    String(aliasName),
    rules,
    domains
  )
  const elapsed = ms(new Date() - start)
  if (res.error) {
    const err = new Error(res.error.message)
    err.userError = true
    throw err
  } else {
    console.log(
      `${chalk.cyan('> Success!')} ${res.ruleCount} rules configured for ${chalk.underline(res.alias)} [${elapsed}]`
    )
  }
}
