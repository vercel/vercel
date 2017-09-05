#!/usr/bin/env node

// Native
const path = require('path')

// Packages
const chalk = require('chalk')
const table = require('text-table')
const minimist = require('minimist')
const fs = require('fs-extra')
const ms = require('ms')
const printf = require('printf')
require('epipebomb')()
const supportsColor = require('supports-color')

// Utilities
const { handleError, error } = require('../util/error')
const NowCerts = require('../util/certs')
const exit = require('../../../util/exit')
const logo = require('../../../util/output/logo')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now certs`)} <ls | create | renew | replace | rm> <cn>

  ${chalk.dim('Note:')}

  This command is intended for advanced use only, normally ${chalk.bold(
    'now'
  )} manages your certificates automatically.

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline(
    'FILE'
  )}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )} Login token
    --crt ${chalk.bold.underline('FILE')}              Certificate file
    --key ${chalk.bold.underline('FILE')}              Certificate key file
    --ca ${chalk.bold.underline('FILE')}               CA certificate chain file

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Listing all your certificates:

      ${chalk.cyan('$ now certs ls')}

  ${chalk.gray('–')} Creating a new certificate:

      ${chalk.cyan('$ now certs create domain.com')}

  ${chalk.gray('–')} Renewing an existing certificate issued with ${chalk.bold(
    'now'
  )}:

      ${chalk.cyan('$ now certs renew domain.com')}

  ${chalk.gray(
    '–'
  )} Replacing an existing certificate with a user-supplied certificate:

      ${chalk.cyan(
        '$ now certs replace --crt domain.crt --key domain.key --ca ca_chain.crt domain.com'
      )}
`)
}

// Options
let argv
let debug
let apiUrl
let subcommand

const main = async ctx => {
  argv = minimist(ctx.argv.slice(2), {
    string: ['crt', 'key', 'ca'],
    boolean: ['help', 'debug'],
    alias: {
      help: 'h',
      debug: 'd'
    }
  })

  argv._ = argv._.slice(1)

  apiUrl = argv.url || 'https://api.zeit.co'
  debug = argv.debug
  subcommand = argv._[0]

  if (argv.help || !subcommand) {
    help()
    exit(0)
  }

  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = credentials.find(item => item.provider === 'sh')

  try {
    await run({ token, sh })
  } catch (err) {
    handleError(err)
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

function formatExpirationDate(date) {
  const diff = date - Date.now()
  return diff < 0
    ? chalk.gray(ms(-diff) + ' ago')
    : chalk.gray('in ' + ms(diff))
}

async function run({ token, sh: { currentTeam, user } }) {
  const certs = new NowCerts({ apiUrl, token, debug, currentTeam })
  const args = argv._.slice(1)
  const start = Date.now()

  if (subcommand === 'ls' || subcommand === 'list') {
    if (args.length !== 0) {
      error(
        `Invalid number of arguments. Usage: ${chalk.cyan('`now certs ls`')}`
      )
      return exit(1)
    }

    const list = await certs.ls()
    const elapsed = ms(new Date() - start)

    console.log(
      `> ${list.length} certificate${list.length === 1
        ? ''
        : 's'} found ${chalk.gray(`[${elapsed}]`)} under ${chalk.bold(
        (currentTeam && currentTeam.slug) || user.username || user.email
      )}`
    )

    if (list.length > 0) {
      const cur = Date.now()
      list.sort((a, b) => {
        return a.cn.localeCompare(b.cn)
      })

      const maxCnLength =
        list.reduce((acc, i) => {
          return Math.max(acc, (i.cn && i.cn.length) || 0)
        }, 0) + 1

      console.log(
        chalk.dim(
          printf(
            `  %-${maxCnLength}s %-8s  %-10s  %-10s`,
            'cn',
            'created',
            'expiration',
            'auto-renew'
          )
        )
      )

      list.forEach(cert => {
        const cn = chalk.bold(cert.cn)
        const time = chalk.gray(ms(cur - new Date(cert.created)) + ' ago')
        const expiration = formatExpirationDate(new Date(cert.expiration))
        const autoRenew = cert.autoRenew ? 'yes' : 'no'
        let spec
        if (supportsColor) {
          spec = `  %-${maxCnLength + 9}s %-18s  %-20s  %-20s\n`
        } else {
          spec = `  %-${maxCnLength}s %-8s  %-10s  %-10s\n`
        }
        process.stdout.write(printf(spec, cn, time, expiration, autoRenew))
      })
    }
  } else if (subcommand === 'create') {
    if (args.length !== 1) {
      error(
        `Invalid number of arguments. Usage: ${chalk.cyan(
          '`now certs create <cn>`'
        )}`
      )
      return exit(1)
    }
    const cn = args[0]
    let cert

    if (argv.crt || argv.key || argv.ca) {
      // Issue a custom certificate
      if (!argv.crt || !argv.key) {
        error(
          `Missing required arguments for a custom certificate entry. Usage: ${chalk.cyan(
            '`now certs create --crt DOMAIN.CRT --key DOMAIN.KEY [--ca CA.CRT] <id | cn>`'
          )}`
        )
        return exit(1)
      }

      const crt = readX509File(argv.crt)
      const key = readX509File(argv.key)
      const ca = argv.ca ? readX509File(argv.ca) : ''

      cert = await certs.put(cn, crt, key, ca)
    } else {
      // Issue a standard certificate
      cert = await certs.create(cn)
    }
    if (!cert) {
      // Cert is undefined and "Cert is already issued" has been printed to stdout
      return exit(1)
    }
    const elapsed = ms(new Date() - start)
    console.log(
      `${chalk.cyan('> Success!')} Certificate entry ${chalk.bold(
        cn
      )} ${chalk.gray(`(${cert.uid})`)} created ${chalk.gray(`[${elapsed}]`)}`
    )
  } else if (subcommand === 'renew') {
    if (args.length !== 1) {
      error(
        `Invalid number of arguments. Usage: ${chalk.cyan(
          '`now certs renew <id | cn>`'
        )}`
      )
      return exit(1)
    }

    const cert = await getCertIdCn(certs, args[0], currentTeam, user)
    if (!cert) {
      return exit(1)
    }
    const yes = await readConfirmation(
      cert,
      'The following certificate will be renewed\n'
    )

    if (!yes) {
      error('User abort')
      return exit(0)
    }

    await certs.renew(cert.cn)
    const elapsed = ms(new Date() - start)
    console.log(
      `${chalk.cyan('> Success!')} Certificate ${chalk.bold(
        cert.cn
      )} ${chalk.gray(`(${cert.uid})`)} renewed ${chalk.gray(`[${elapsed}]`)}`
    )
  } else if (subcommand === 'replace') {
    if (!argv.crt || !argv.key) {
      error(
        `Invalid number of arguments. Usage: ${chalk.cyan(
          '`now certs replace --crt DOMAIN.CRT --key DOMAIN.KEY [--ca CA.CRT] <id | cn>`'
        )}`
      )
      return exit(1)
    }

    const crt = readX509File(argv.crt)
    const key = readX509File(argv.key)
    const ca = argv.ca ? readX509File(argv.ca) : ''

    const cert = await getCertIdCn(certs, args[0], currentTeam, user)
    if (!cert) {
      return exit(1)
    }
    const yes = await readConfirmation(
      cert,
      'The following certificate will be replaced permanently\n'
    )
    if (!yes) {
      error('User abort')
      return exit(0)
    }

    await certs.put(cert.cn, crt, key, ca)
    const elapsed = ms(new Date() - start)
    console.log(
      `${chalk.cyan('> Success!')} Certificate ${chalk.bold(
        cert.cn
      )} ${chalk.gray(`(${cert.uid})`)} replaced ${chalk.gray(`[${elapsed}]`)}`
    )
  } else if (subcommand === 'rm' || subcommand === 'remove') {
    if (args.length !== 1) {
      error(
        `Invalid number of arguments. Usage: ${chalk.cyan(
          '`now certs rm <id | cn>`'
        )}`
      )
      return exit(1)
    }

    const cert = await getCertIdCn(certs, args[0], currentTeam, user)
    if (!cert) {
      return exit(1)
    }
    const yes = await readConfirmation(
      cert,
      'The following certificate will be removed permanently\n'
    )
    if (!yes) {
      error('User abort')
      return exit(0)
    }

    await certs.delete(cert.cn)
    const elapsed = ms(new Date() - start)
    console.log(
      `${chalk.cyan('> Success!')} Certificate ${chalk.bold(
        cert.cn
      )} ${chalk.gray(`(${cert.uid})`)} removed ${chalk.gray(`[${elapsed}]`)}`
    )
  } else {
    error(
      'Please specify a valid subcommand: ls | create | renew | replace | rm'
    )
    help()
    exit(1)
  }
  return certs.close()
}

process.on('uncaughtException', err => {
  handleError(err)
  exit(1)
})

function readConfirmation(cert, msg) {
  return new Promise(resolve => {
    const time = chalk.gray(ms(new Date() - new Date(cert.created)) + ' ago')
    const tbl = table([[cert.uid, chalk.bold(cert.cn), time]], {
      align: ['l', 'r', 'l'],
      hsep: ' '.repeat(6)
    })

    process.stdout.write(`> ${msg}`)
    process.stdout.write('  ' + tbl + '\n')

    process.stdout.write(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`
    )

    process.stdin
      .on('data', d => {
        process.stdin.pause()
        resolve(d.toString().trim().toLowerCase() === 'y')
      })
      .resume()
  })
}

function readX509File(file) {
  return fs.readFileSync(path.resolve(file), 'utf8')
}

async function getCertIdCn(certs, idOrCn, currentTeam, user) {
  const list = await certs.ls()
  const thecert = list.filter(cert => {
    return cert.uid === idOrCn || cert.cn === idOrCn
  })[0]

  if (!thecert) {
    error(
      `No certificate found by id or cn "${idOrCn}" under ${chalk.bold(
        (currentTeam && currentTeam.slug) || user.username || user.email
      )}`
    )
    return null
  }

  return thecert
}
