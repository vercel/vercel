#!/usr/bin/env node

// Native
import path from 'path'

// Packages
import chalk from 'chalk'
import table from 'text-table'
import minimist from 'minimist'
import fs from 'fs-promise'
import ms from 'ms'

// Ours
import strlen from '../lib/strlen'
import * as cfg from '../lib/cfg'
import {handleError, error} from '../lib/error'
import NowCerts from '../lib/certs'
import login from '../lib/login'

const argv = minimist(process.argv.slice(2), {
  string: ['config', 'token', 'crt', 'key', 'ca'],
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
  ${chalk.bold('𝚫 now certs')} <ls | create | renew | replace | rm> <cn>

  ${chalk.dim('Note:')}

  This command is intended for advanced use only, normally ${chalk.bold('now')} manages your certificates automatically.

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')} Login token
    --crt ${chalk.bold.underline('FILE')}              Certificate file
    --key ${chalk.bold.underline('FILE')}              Certificate key file
    --ca ${chalk.bold.underline('FILE')}               CA certificate chain file

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Listing all your certificates:

      ${chalk.cyan('$ now certs ls')}

  ${chalk.gray('–')} Creating a new certificate:

      ${chalk.cyan('$ now certs create domain.com')}

  ${chalk.gray('–')} Renewing an existing certificate issued with ${chalk.bold('now')}:

      ${chalk.cyan('$ now certs renew domain.com')}

  ${chalk.gray('–')} Replacing an existing certificate with a user-supplied certificate:

      ${chalk.cyan('$ now certs replace --crt domain.crt --key domain.key --ca ca_chain.crt domain.com')}
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

if (argv.help || !subcommand) {
  help()
  exit(0)
} else {
  const config = cfg.read()

  Promise.resolve(argv.token || config.token || login(apiUrl))
  .then(async token => {
    try {
      await run(token)
    } catch (err) {
      handleError(err)
      exit(1)
    }
  })
  .catch(e => {
    error(`Authentication error – ${e.message}`)
    exit(1)
  })
}

function formatExpirationDate(date) {
  const diff = date - Date.now()
  return diff < 0 ? chalk.gray(ms(-diff) + ' ago') : chalk.gray('in ' + ms(diff))
}

async function run(token) {
  const certs = new NowCerts(apiUrl, token, {debug})
  const args = argv._.slice(1)
  const start = Date.now()

  if (subcommand === 'ls' || subcommand === 'list') {
    if (args.length !== 0) {
      error(`Invalid number of arguments. Usage: ${chalk.cyan('`now certs ls`')}`)
      return exit(1)
    }

    const list = await certs.ls()
    const elapsed = ms(new Date() - start)

    console.log(`> ${list.length} certificate${list.length === 1 ? '' : 's'} found ${chalk.gray(`[${elapsed}]`)}`)

    if (list.length > 0) {
      const cur = Date.now()
      list.sort((a, b) => {
        return a.cn.localeCompare(b.cn)
      })
      const header = [['', 'id', 'cn', 'created', 'expiration'].map(s => chalk.dim(s))]
      const out = table(header.concat(list.map(cert => {
        const cn = chalk.bold(cert.cn)
        const time = chalk.gray(ms(cur - new Date(cert.created)) + ' ago')
        const expiration = formatExpirationDate(new Date(cert.expiration))
        return [
          '',
          cert.uid ? cert.uid : 'unknown',
          cn,
          time,
          expiration
        ]
      })), {align: ['l', 'r', 'l', 'l', 'l'], hsep: ' '.repeat(2), stringLength: strlen})

      if (out) {
        console.log('\n' + out + '\n')
      }
    }
  } else if (subcommand === 'create') {
    if (args.length !== 1) {
      error(`Invalid number of arguments. Usage: ${chalk.cyan('`now certs create <cn>`')}`)
      return exit(1)
    }
    const cn = args[0]
    let cert

    if (argv.crt || argv.key || argv.ca) { // Issue a custom certificate
      if (!argv.crt || !argv.key) {
        error(`Missing required arguments for a custom certificate entry. Usage: ${chalk.cyan('`now certs create --crt DOMAIN.CRT --key DOMAIN.KEY [--ca CA.CRT] <id | cn>`')}`)
        return exit(1)
      }

      const crt = readX509File(argv.crt)
      const key = readX509File(argv.key)
      const ca = argv.ca ? readX509File(argv.ca) : ''

      cert = await certs.put(cn, crt, key, ca)
    } else { // Issue a standard certificate
      cert = await certs.create(cn)
    }
    if (!cert) {
      // Cert is undefined and "Cert is already issued" has been printed to stdout
      return exit(1)
    }
    const elapsed = ms(new Date() - start)
    console.log(`${chalk.cyan('> Success!')} Certificate entry ${chalk.bold(cn)} ${chalk.gray(`(${cert.uid})`)} created ${chalk.gray(`[${elapsed}]`)}`)
  } else if (subcommand === 'renew') {
    if (args.length !== 1) {
      error(`Invalid number of arguments. Usage: ${chalk.cyan('`now certs renew <id | cn>`')}`)
      return exit(1)
    }

    const cert = await getCertIdCn(certs, args[0])
    if (!cert) {
      return exit(1)
    }
    const yes = await readConfirmation(cert, 'The following certificate will be renewed\n')

    if (!yes) {
      error('User abort')
      return exit(0)
    }

    await certs.renew(cert.cn)
    const elapsed = ms(new Date() - start)
    console.log(`${chalk.cyan('> Success!')} Certificate ${chalk.bold(cert.cn)} ${chalk.gray(`(${cert.uid})`)} renewed ${chalk.gray(`[${elapsed}]`)}`)
  } else if (subcommand === 'replace') {
    if (!argv.crt || !argv.key) {
      error(`Invalid number of arguments. Usage: ${chalk.cyan('`now certs replace --crt DOMAIN.CRT --key DOMAIN.KEY [--ca CA.CRT] <id | cn>`')}`)
      return exit(1)
    }

    const crt = readX509File(argv.crt)
    const key = readX509File(argv.key)
    const ca = argv.ca ? readX509File(argv.ca) : ''

    const cert = await getCertIdCn(certs, args[0])
    if (!cert) {
      return exit(1)
    }
    const yes = await readConfirmation(cert, 'The following certificate will be replaced permanently\n')
    if (!yes) {
      error('User abort')
      return exit(0)
    }

    await certs.put(cert.cn, crt, key, ca)
    const elapsed = ms(new Date() - start)
    console.log(`${chalk.cyan('> Success!')} Certificate ${chalk.bold(cert.cn)} ${chalk.gray(`(${cert.uid})`)} replaced ${chalk.gray(`[${elapsed}]`)}`)
  } else if (subcommand === 'rm' || subcommand === 'remove') {
    if (args.length !== 1) {
      error(`Invalid number of arguments. Usage: ${chalk.cyan('`now certs rm <id | cn>`')}`)
      return exit(1)
    }

    const cert = await getCertIdCn(certs, args[0])
    if (!cert) {
      return exit(1)
    }
    const yes = await readConfirmation(cert, 'The following certificate will be removed permanently\n')
    if (!yes) {
      error('User abort')
      return exit(0)
    }

    await certs.delete(cert.cn)
    const elapsed = ms(new Date() - start)
    console.log(`${chalk.cyan('> Success!')} Certificate ${chalk.bold(cert.cn)} ${chalk.gray(`(${cert.uid})`)} removed ${chalk.gray(`[${elapsed}]`)}`)
  } else {
    error('Please specify a valid subcommand: ls | create | renew | replace | rm')
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
    const tbl = table(
      [[cert.uid, chalk.bold(cert.cn), time]],
      {align: ['l', 'r', 'l'], hsep: ' '.repeat(6)}
    )

    process.stdout.write(`> ${msg}`)
    process.stdout.write('  ' + tbl + '\n')

    process.stdout.write(`${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`)

    process.stdin.on('data', d => {
      process.stdin.pause()
      resolve(d.toString().trim().toLowerCase() === 'y')
    }).resume()
  })
}

function readX509File(file) {
  return fs.readFileSync(path.resolve(file), 'utf8')
}

async function getCertIdCn(certs, idOrCn) {
  const list = await certs.ls()
  const thecert = list.filter(cert => {
    return cert.uid === idOrCn || cert.cn === idOrCn
  })[0]

  if (!thecert) {
    error(`No certificate found by id or cn "${idOrCn}"`)
    return null
  }

  return thecert
}
