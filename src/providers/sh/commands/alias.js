#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const minimist = require('minimist')
const table = require('text-table')
const ms = require('ms')
const printf = require('printf')
require('epipebomb')()
const supportsColor = require('supports-color')

// Utilities
const strlen = require('../util/strlen')
const NowAlias = require('../util/alias')
const NowDomains = require('../util/domains')
const { handleError, error } = require('../util/error')
const toHost = require('../util/to-host')
const { reAlias } = require('../util/re-alias')
const exit = require('../../../util/exit')
const info = require('../../../util/output/info')
const logo = require('../../../util/output/logo')
const promptBool = require('../../../util/input/prompt-bool')

const grayWidth = 10
const underlineWidth = 11

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now alias`)} <ls | set | rm> <deployment> <alias>

  ${chalk.dim('Options:')}

    -h, --help                         Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}       Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}        Path to the global ${'`.now`'} directory
    -r ${chalk.bold.underline('RULES_FILE')}, --rules=${chalk.bold.underline(
    'RULES_FILE'
  )}  Rules file
    -d, --debug                        Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}            Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Lists all your aliases:

      ${chalk.cyan('$ now alias ls')}

  ${chalk.gray('–')} Adds a new alias to ${chalk.underline('my-api.now.sh')}:

      ${chalk.cyan(
        `$ now alias set ${chalk.underline(
          'api-ownv3nc9f8.now.sh'
        )} ${chalk.underline('my-api.now.sh')}`
      )}

      The ${chalk.dim('`.now.sh`')} suffix can be ommited:

      ${chalk.cyan('$ now alias set api-ownv3nc9f8 my-api')}

      The deployment id can be used as the source:

      ${chalk.cyan('$ now alias set deploymentId my-alias')}

      Custom domains work as alias targets:

      ${chalk.cyan(
        `$ now alias set ${chalk.underline(
          'api-ownv3nc9f8.now.sh'
        )} ${chalk.underline('my-api.com')}`
      )}

      ${chalk.dim('–')} The subcommand ${chalk.dim(
    '`set`'
  )} is the default and can be skipped.
      ${chalk.dim('–')} ${chalk.dim(
    '`http(s)://`'
  )} in the URLs is unneeded / ignored.

  ${chalk.gray('–')} Add and modify path based aliases for ${chalk.underline(
    'zeit.ninja'
  )}:

      ${chalk.cyan(
        `$ now alias ${chalk.underline('zeit.ninja')} -r ${chalk.underline(
          'rules.json'
        )}`
      )}

      Export effective routing rules:

      ${chalk.cyan(
        `$ now alias ls aliasId --json > ${chalk.underline('rules.json')}`
      )}

      ${chalk.cyan(`$ now alias ls zeit.ninja`)}

  ${chalk.gray('–')} Removing an alias:

      ${chalk.cyan('$ now alias rm aliasId')}

      To get the list of alias ids, use ${chalk.dim('`now alias ls`')}.

  ${chalk.dim('Alias:')} ln
`)
}

// Options
let argv
let subcommand
let debug
let apiUrl

const main = async ctx => {
  argv = minimist(ctx.argv.slice(2), {
    string: ['config', 'rules'],
    boolean: ['help', 'debug'],
    alias: {
      help: 'h',
      config: 'c',
      rules: 'r',
      debug: 'd'
    }
  })

  argv._ = argv._.slice(1)
  subcommand = argv._[0]

  debug = argv.debug
  apiUrl = argv.apiUrl || 'https://api.zeit.co'

  if (argv.help) {
    help()
    process.exit(0)
  }

  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')

  try {
    await run({ token, sh })
  } catch (err) {
    if (err.userError) {
      console.error(error(err.message))
    } else {
      console.error(error(`Unknown error: ${err}\n${err.stack}`))
    }

    exit(1)
  }
}

module.exports = async ctx => {
  try {
    await main(ctx)
  } catch (err) {
    handleError(err)
    process.exit(1)
  }
}

async function run({ token, sh: { currentTeam, user } }) {
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
          console.error(error(`Could not match path alias for: ${argv._[1]}`))
          return exit(1)
        }

        if (argv.json) {
          console.log(JSON.stringify({ rules: item.rules }, null, 2))
        } else {
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

          console.log(text)
        }
        break
      } else if (args.length !== 0) {
        console.error(error(
          `Invalid number of arguments. Usage: ${chalk.cyan('`now alias ls`')}`
        ))
        return exit(1)
      }

      const start_ = new Date()
      const aliases = await alias.ls()
      aliases.sort((a, b) => new Date(b.created) - new Date(a.created))
      const current = new Date()
      const sourceUrlLength =
        aliases.reduce((acc, i) => {
          return Math.max(acc, (i.deployment && i.deployment.url.length) || 0)
        }, 0) + 9
      const aliasLength =
        aliases.reduce((acc, i) => {
          return Math.max(acc, (i.alias && i.alias.length) || 0)
        }, 0) + 8
      const elapsed_ = ms(new Date() - start_)
      console.log(
        `> ${aliases.length} alias${aliases.length === 1
          ? ''
          : 'es'} found ${chalk.gray(`[${elapsed_}]`)} under ${chalk.bold(
          (currentTeam && currentTeam.slug) || user.username || user.email
        )}`
      )
      console.log()

      if (supportsColor) {
        const urlSpecHeader = `%-${sourceUrlLength + 1}s`
        const aliasSpecHeader = `%-${aliasLength + 1}s`
        console.log(
          printf(
            `  ${chalk.gray(urlSpecHeader + ' ' + aliasSpecHeader + '  %5s')}`,
            'source',
            'url',
            'age'
          )
        )
      } else {
        const urlSpecHeader = `%-${sourceUrlLength}s`
        const aliasSpecHeader = `%-${aliasLength}s`
        console.log(
          printf(
            `  ${urlSpecHeader} ${aliasSpecHeader} %5s`,
            'source',
            'url',
            'age'
          )
        )
      }

      let text = ''
      aliases.forEach(_alias => {
        let urlSpec = sourceUrlLength
        let aliasSpec = aliasLength
        let ageSpec = 5
        const _url = chalk.underline(_alias.alias)
        let _sourceUrl
        if (supportsColor) {
          aliasSpec += underlineWidth
          ageSpec += grayWidth
        }
        if (_alias.deployment) {
          _sourceUrl = chalk.underline(_alias.deployment.url)
          if (supportsColor) {
            urlSpec += grayWidth
          }
        } else if (_alias.rules) {
          _sourceUrl = chalk.gray(
            `[${_alias.rules.length} custom rule${_alias.rules.length > 1
              ? 's'
              : ''}]`
          )
          if (supportsColor) {
            urlSpec += underlineWidth
          }
        } else {
          _sourceUrl = chalk.gray('<null>')
        }

        const time = chalk.gray(ms(current - new Date(_alias.created)))
        text += printf(
          `  %-${urlSpec}s %-${aliasSpec}s %${ageSpec}s\n`,
          _sourceUrl,
          _url,
          time
        )
      })

      console.log(text)
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
        console.error(error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            '`now alias rm <id>`'
          )}`
        ))
        return exit(1)
      }

      const _aliases = await alias.ls()
      const _alias = findAlias(_target, _aliases)

      if (!_alias) {
        const err = new Error(
          `Alias not found by "${_target}" under ${chalk.bold(
            (currentTeam && currentTeam.slug) || user.username || user.email
          )}. Run ${chalk.dim('`now alias ls`')} to see your aliases.`
        )
        err.userError = true
        throw err
      }

      try {
        const confirmation = await confirmDeploymentRemoval(alias, _alias)
        if (!confirmation) {
          info('Aborted')
          return process.exit(0)
        }

        const start = new Date()
        await alias.rm(_alias)
        const elapsed = ms(new Date() - start)
        console.log(
          `${chalk.cyan('> Success!')} Alias ${chalk.bold(
            _alias.uid
          )} removed [${elapsed}]`
        )
      } catch (err) {
        console.error(error(err))
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
        console.error(error(
          `Invalid number of arguments. Usage: ${chalk.cyan(
            '`now alias set <id> <domain>`'
          )}`
        ))
        return exit(1)
      }
      await alias.set(
        String(args[0]),
        String(args[1]),
        domains,
        currentTeam,
        user
      )
      break
    }
    default: {
      if (argv._.length === 0) {
        await reAlias(
          token,
          null,
          null,
          help,
          exit,
          apiUrl,
          debug,
          alias,
          currentTeam,
          user
        )
        break
      }

      if (argv.rules) {
        await updatePathAlias(alias, argv._[0], argv.rules, domains)
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
          alias,
          currentTeam,
          user
        )
        break
      } else if (argv._.length === 2) {
        await alias.set(
          String(argv._[0]),
          String(argv._[1]),
          domains,
          currentTeam,
          user
        )
      } else if (argv._.length >= 3) {
        console.error(error('Invalid number of arguments'))
        help()
        exit(1)
      } else {
        console.error(error('Please specify a valid subcommand: ls | set | rm'))
        help()
        exit(1)
      }
    }
  }

  domains.close()
  alias.close()
}

async function confirmDeploymentRemoval(alias, _alias) {
  const time = chalk.gray(ms(new Date() - new Date(_alias.created)) + ' ago')
  const _sourceUrl = _alias.deployment
    ? chalk.underline(_alias.deployment.url)
    : null
  const tbl = table(
    [
      [
        _alias.uid,
        ...(_sourceUrl ? [_sourceUrl] : []),
        chalk.underline(_alias.alias),
        time
      ]
    ],
    { hsep: ' '.repeat(6) }
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
      `${chalk.cyan(
        '> Success!'
      )} ${res.ruleCount} rules configured for ${chalk.underline(
        res.alias
      )} [${elapsed}]`
    )
  }
}
