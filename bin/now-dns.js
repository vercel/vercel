#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const minimist = require('minimist')
const ms = require('ms')
const table = require('text-table')

// Ours
const cfg = require('../lib/cfg')
const DomainRecords = require('../lib/domain-records')
const indent = require('../lib/indent')
const login = require('../lib/login')
const strlen = require('../lib/strlen')
const {handleError, error} = require('../lib/error')

const argv = minimist(process.argv.slice(2), {
  string: ['config'],
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
  ${chalk.bold('𝚫 now dns ls')} [domain]
  ${chalk.bold('𝚫 now dns add')} <domain> <name> <A | AAAA | ALIAS | CNAME | MX | TXT> <value> [mx_priority]
  ${chalk.bold('𝚫 now dns rm')} <id>

  ${chalk.dim('Options:')}

    -h, --help              output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline('FILE')}  config file
    -d, --debug             debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline('TOKEN')} login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} List all your DNS records

      ${chalk.cyan('$ now dns ls')}

  ${chalk.gray('–')} Add an A record for a subdomain

      ${chalk.cyan('$ now dns add zeit.rocks subdomain A 198.51.100.100')}

  ${chalk.gray('–')} Add an MX record (@ as a name refers to the domain)

      ${chalk.cyan('$ now dns add zeit.rocks @ MX mail.zeit.rocks 10')}
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

async function run(token) {
  const domainRecords = new DomainRecords(apiUrl, token, {debug})
  const args = argv._.slice(1)
  const start = Date.now()

  if (subcommand === 'ls' || subcommand === 'list') {
    if (args.length > 1) {
      error(`Invalid number of arguments. Usage: ${chalk.cyan('`now dns ls [domain]`')}`)
      return exit(1)
    }

    const elapsed = ms(new Date() - start)
    const res = await domainRecords.ls(args[0])
    const text = []
    let count = 0
    res.forEach((records, domain) => {
      count += records.length
      if (records.length > 0) {
        const cur = Date.now()
        const header = [['', 'id', 'name', 'type', 'value', 'aux', 'created'].map(s => chalk.dim(s))]
        const out = table(header.concat(records.map(record => {
          const time = chalk.gray(ms(cur - new Date(Number(record.created))) + ' ago')
          return [
            '',
            record.id,
            record.name,
            record.type,
            record.value,
            record.mxPriority ? record.mxPriority : '',
            time
          ]
        })), {align: ['l', 'r', 'l', 'l', 'l', 'l'], hsep: ' '.repeat(2), stringLength: strlen})
        text.push(`\n\n${chalk.bold(domain)}\n${indent(out, 2)}`)
      }
    })
    console.log(`> ${count} record${count === 1 ? '' : 's'} found ${chalk.gray(`[${elapsed}]`)}`)
    console.log(text.join(''))
  } else if (subcommand === 'add') {
    const domain = args[0]
    const name = args[1] === '@' ? '' : args[1]
    const type = args[2]
    const value = args[3]
    const mxPriority = args[4]

    if (!(args.length >= 4 && args.length <= 5) ||
        (type === 'MX' ? !mxPriority : mxPriority)) {
      error(`Invalid number of arguments. Usage: ${chalk.cyan('`now dns add <domain> <name> <type> <value> [mx_priority]`')}`)
      return exit(1)
    }

    const record = await domainRecords.create(domain, {name, type, value, mxPriority})
    const elapsed = ms(new Date() - start)
    console.log(`${chalk.cyan('> Success!')} A new DNS record for domain ${chalk.bold(domain)} ${chalk.gray(`(${record.uid})`)} created ${chalk.gray(`[${elapsed}]`)}`)
  } else if (subcommand === 'rm' || subcommand === 'remove') {
    if (args.length !== 1) {
      error(`Invalid number of arguments. Usage: ${chalk.cyan('`now dns rm <id>`')}`)
      return exit(1)
    }

    const record = await domainRecords.getRecord(args[0])
    if (!record) {
      error('DNS record not found')
      return exit(1)
    }

    const yes = await readConfirmation(record, 'The following record will be removed permanently\n')
    if (!yes) {
      error('User abort')
      return exit(0)
    }

    await domainRecords.delete(record.domain, record.id)
    const elapsed = ms(new Date() - start)
    console.log(`${chalk.cyan('> Success!')} Record ${chalk.gray(`${record.id}`)} removed ${chalk.gray(`[${elapsed}]`)}`)
  } else {
    error('Please specify a valid subcommand: ls | add | rm')
    help()
    exit(1)
  }
  return domainRecords.close()
}

process.on('uncaughtException', err => {
  handleError(err)
  exit(1)
})

function readConfirmation(record, msg) {
  return new Promise(resolve => {
    const time = chalk.gray(ms(new Date() - new Date(Number(record.created))) + ' ago')
    const tbl = table(
      [[record.id,
        chalk.bold(`${record.name.length > 0 ? record.name + '.' : ''}${record.domain} ${record.type} ${record.value} ${record.mxPriority ? record.mxPriority : ''}`),
        time]],
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
