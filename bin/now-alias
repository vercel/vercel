#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const minimist = require('minimist')
const table = require('text-table')
const ms = require('ms')

// Ours
const strlen = require('../lib/strlen')
const NowAlias = require('../lib/alias')
const login = require('../lib/login')
const cfg = require('../lib/cfg')
const {error} = require('../lib/error')
const toHost = require('../lib/to-host')
const readMetaData = require('../lib/read-metadata')

const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token'],
  boolean: ['help', 'debug'],
  alias: {
    help: 'h',
    config: 'c',
    debug: 'd',
    token: 't'
  }
})
const subcommand = argv._[0]

// options
const help = () => {
  console.log(`
  ${chalk.bold('𝚫 now alias')} <ls | set | rm> <deployment> <alias>

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')} Login token

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

  ${chalk.gray('–')} Removing an alias:

      ${chalk.cyan('$ now alias rm aliasId')}

      To get the list of alias ids, use ${chalk.dim('`now alias ls`')}.

  ${chalk.dim('Alias:')} ln
`)
}

// options
const debug = argv.debug
const apiUrl = argv.url || 'https://api.zeit.co'

if (argv.config) {
  cfg.setConfigFile(argv.config)
}

const exit = code => {
  // we give stdout some time to flush out
  // because there's a node bug where
  // stdout writes are asynchronous
  // https://github.com/nodejs/node/issues/6456
  setTimeout(() => process.exit(code || 0), 100)
}

if (argv.help) {
  help()
  exit(0)
} else {
  const config = cfg.read()

  Promise.resolve(argv.token || config.token || login(apiUrl))
  .then(async token => {
    try {
      await run(token)
    } catch (err) {
      if (err.userError) {
        error(err.message)
      } else {
        error(`Unknown error: ${err.stack}`)
      }
      exit(1)
    }
  })
  .catch(e => {
    error(`Authentication error – ${e.message}`)
    exit(1)
  })
}

async function run(token) {
  const alias = new NowAlias(apiUrl, token, {debug})
  const args = argv._.slice(1)

  switch (subcommand) {
    case 'ls':
    case 'list': {
      if (args.length !== 0) {
        error(`Invalid number of arguments. Usage: ${chalk.cyan('`now alias ls`')}`)
        return exit(1)
      }

      const start_ = new Date()
      const list = await alias.list()
      const urls = new Map(list.map(l => [l.uid, l.url]))
      const aliases = await alias.ls()
      aliases.sort((a, b) => new Date(b.created) - new Date(a.created))
      const current = new Date()

      const header = [['', 'id', 'source', 'url', 'created'].map(s => chalk.dim(s))]
      const text = list.length === 0 ? null : table(header.concat(aliases.map(_alias => {
        const _url = chalk.underline(`https://${_alias.alias}`)
        const target = _alias.deploymentId
        const _sourceUrl = urls.get(target) ? chalk.underline(`https://${urls.get(target)}`) : chalk.gray('<null>')

        const time = chalk.gray(ms(current - new Date(_alias.created)) + ' ago')
        return [
          '',
          // we default to `''` because some early aliases didn't
          // have an uid associated
          _alias.uid === null ? '' : _alias.uid,
          _sourceUrl,
          _url,
          time
        ]
      })), {align: ['l', 'r', 'l', 'l'], hsep: ' '.repeat(2), stringLength: strlen})

      const elapsed_ = ms(new Date() - start_)
      console.log(`> ${aliases.length} alias${aliases.length === 1 ? '' : 'es'} found ${chalk.gray(`[${elapsed_}]`)}`)

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
        error(`Invalid number of arguments. Usage: ${chalk.cyan('`now alias rm <id>`')}`)
        return exit(1)
      }

      const _aliases = await alias.ls()
      const _alias = findAlias(_target, _aliases)

      if (!_alias) {
        const err = new Error(`Alias not found by "${_target}". Run ${chalk.dim('`now alias ls`')} to see your aliases.`)
        err.userError = true
        throw err
      }

      try {
        const confirmation = (await readConfirmation(alias, _alias, _aliases)).toLowerCase()
        if (confirmation !== 'y' && confirmation !== 'yes') {
          console.log('\n> Aborted')
          process.exit(0)
        }

        const start = new Date()
        await alias.rm(_alias)
        const elapsed = ms(new Date() - start)
        console.log(`${chalk.cyan('> Success!')} Alias ${chalk.bold(_alias.uid)} removed [${elapsed}]`)
      } catch (err) {
        error(err)
        exit(1)
      }

      break
    }
    case 'add':
    case 'set': {
      if (args.length !== 2) {
        error(`Invalid number of arguments. Usage: ${chalk.cyan('`now alias set <id> <domain>`')}`)
        return exit(1)
      }
      await alias.set(String(args[0]), String(args[1]))
      break
    }
    default: {
      if (argv._.length === 0) {
        await realias(alias)
        break
      }

      if (argv._.length === 2) {
        await alias.set(String(argv._[0]), String(argv._[1]))
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

  alias.close()
}

async function readConfirmation(alias, _alias) {
  const deploymentsList = await alias.list()
  const urls = new Map(deploymentsList.map(l => [l.uid, l.url]))

  return new Promise(resolve => {
    const time = chalk.gray(ms(new Date() - new Date(_alias.created)) + ' ago')
    const _sourceUrl = chalk.underline(`https://${urls.get(_alias.deploymentId)}`)
    const tbl = table(
      [[_alias.uid, _sourceUrl, chalk.underline(`https://${_alias.alias}`), time]],
      {align: ['l', 'r', 'l'], hsep: ' '.repeat(6)}
    )

    process.stdout.write('> The following alias will be removed permanently\n')
    process.stdout.write('  ' + tbl + '\n')
    process.stdout.write(`  ${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`)

    process.stdin.on('data', d => {
      process.stdin.pause()
      resolve(d.toString().trim())
    }).resume()
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

    // match prefix
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

async function realias(alias) {
  const path = process.cwd()
  const {pkg, name} = await readMetaData(path, {
    deploymentType: 'npm', // hard coding settings…
    quiet: true // `quiet`
  })

  const pkgConfig = pkg ? pkg.now || {} : {}
  const target = pkgConfig.alias

  // the user never intended to support aliases from the package
  if (!target) {
    help()
    return exit(0)
  }

  // now try to find the last deployment
  const source = await alias.last(name)

  await alias.set(source.url, target)
}
