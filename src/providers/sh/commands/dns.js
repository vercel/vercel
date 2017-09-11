#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const mri = require('mri')
const ms = require('ms')
const table = require('text-table')

// Utilities
const DomainRecords = require('../util/domain-records')
const indent = require('../util/indent')
const strlen = require('../util/strlen')
const { handleError, error } = require('../util/error')
const exit = require('../../../util/exit')
const logo = require('../../../util/output/logo')

const help = () => {
  console.log(`
  ${chalk.bold(
    `${logo} now dns`
  )} [options] <command>

  ${chalk.dim('Commands:')}

    add   [details]    Add a new DNS entry (see below for examples)
    rm    [id]         Remove a DNS entry using its ID
    ls    [domain]     List all DNS entries for a domain

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -d, --debug                    Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add an A record for a subdomain

      ${chalk.cyan(
        '$ now dns add <DOMAIN> <SUBDOMAIN> <A | AAAA | ALIAS | CNAME | TXT>  <VALUE>'
      )}
      ${chalk.cyan('$ now dns add zeit.rocks api A 198.51.100.100')}

  ${chalk.gray('–')} Add an MX record (@ as a name refers to the domain)

      ${chalk.cyan(
        '$ now dns add <DOMAIN> @ MX <RECORD VALUE> <PRIORITY>'
      )}
      ${chalk.cyan('$ now dns add zeit.rocks @ MX mail.zeit.rocks 10')}

  ${chalk.gray('–')} Add an SVR record

      ${chalk.cyan(
        '$ now dns add <DOMAIN> <NAME> SRV <PRIORITY> <WEIGHT> <PORT> <TARGET>'
      )}
      ${chalk.cyan('$ now dns add zeit.rocks SRV 10 0 389 zeit.party')}
`)
}

// Options
let argv
let debug
let apiUrl
let subcommand

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    boolean: ['help', 'debug'],
    alias: {
      help: 'h',
      debug: 'd'
    }
  })

  argv._ = argv._.slice(1)

  debug = argv.debug
  apiUrl = argv.url || 'https://api.zeit.co'
  subcommand = argv._[0]

  if (argv.help || !subcommand) {
    help()
    await exit(0)
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

async function run({ token, sh: { currentTeam, user } }) {
  const domainRecords = new DomainRecords({ apiUrl, token, debug, currentTeam })
  const args = argv._.slice(1)
  const start = Date.now()

  if (subcommand === 'ls' || subcommand === 'list') {
    if (args.length > 1) {
      console.error(error(
        `Invalid number of arguments. Usage: ${chalk.cyan(
          '`now dns ls [domain]`'
        )}`
      ))
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
        const header = [
          ['', 'id', 'name', 'type', 'value', 'aux', 'created'].map(s =>
            chalk.dim(s)
          )
        ]
        const out = table(
          header.concat(
            records.map(record => {
              const time = chalk.gray(
                ms(cur - new Date(Number(record.created))) + ' ago'
              )
              const aux = (() => {
                if (record.mxPriority !== undefined) return record.mxPriority
                if (record.priority !== undefined) return record.priority
                return ''
              })()
              return [
                '',
                record.id,
                record.name,
                record.type,
                record.value,
                aux,
                time
              ]
            })
          ),
          {
            align: ['l', 'r', 'l', 'l', 'l', 'l'],
            hsep: ' '.repeat(2),
            stringLength: strlen
          }
        )
        text.push(`\n\n${chalk.bold(domain)}\n${indent(out, 2)}`)
      }
    })
    console.log(
      `> ${count} record${count === 1 ? '' : 's'} found ${chalk.gray(
        `[${elapsed}]`
      )} under ${chalk.bold(
        (currentTeam && currentTeam.slug) || user.username || user.email
      )}`
    )
    console.log(text.join(''))
  } else if (subcommand === 'add') {
    const param = parseAddArgs(args)
    if (!param) {
      console.error(error(
        `Invalid number of arguments. See: ${chalk.cyan(
          '`now dns --help`'
        )} for usage.`
      ))
      return exit(1)
    }
    const record = await domainRecords.create(param.domain, param.data)
    const elapsed = ms(new Date() - start)
    console.log(
      `${chalk.cyan('> Success!')} A new DNS record for domain ${chalk.bold(
        param.domain
      )} ${chalk.gray(`(${record.uid})`)} created ${chalk.gray(
        `[${elapsed}]`
      )} (${chalk.bold(
        (currentTeam && currentTeam.slug) || user.username || user.email
      )})`
    )
  } else if (subcommand === 'rm' || subcommand === 'remove') {
    if (args.length !== 1) {
      console.error(error(
        `Invalid number of arguments. Usage: ${chalk.cyan('`now dns rm <id>`')}`
      ))
      return exit(1)
    }

    const record = await domainRecords.getRecord(args[0])
    if (!record) {
      console.error(error('DNS record not found'))
      return exit(1)
    }

    const yes = await readConfirmation(
      record,
      'The following record will be removed permanently \n'
    )
    if (!yes) {
      console.error(error('User abort'))
      return exit(0)
    }

    await domainRecords.delete(record.domain, record.id)
    const elapsed = ms(new Date() - start)
    console.log(
      `${chalk.cyan('> Success!')} Record ${chalk.gray(
        `${record.id}`
      )} removed ${chalk.gray(`[${elapsed}]`)}`
    )
  } else {
    console.error(error('Please specify a valid subcommand: ls | add | rm'))
    help()
    exit(1)
  }
  return domainRecords.close()
}

process.on('uncaughtException', err => {
  handleError(err)
  exit(1)
})

function parseAddArgs(args) {
  if (!args || args.length < 4) {
    return null
  }

  const domain = args[0]
  const name = args[1] === '@' ? '' : args[1].toString()
  const type = args[2]
  const value = args[3]

  if (!(domain && typeof name === 'string' && type)) {
    return null
  }

  if (type === 'MX') {
    if (args.length !== 5) {
      return null
    }

    return {
      domain,
      data: {
        name,
        type,
        value,
        mxPriority: Number(args[4])
      }
    }
  } else if (type === 'SRV') {
    if (args.length !== 7) {
      return null
    }

    return {
      domain,
      data: {
        name,
        type,
        srv: {
          priority: Number(value),
          weight: Number(args[4]),
          port: Number(args[5]),
          target: args[6]
        }
      }
    }
  }

  if (args.length !== 4) {
    return null
  }

  return {
    domain,
    data: {
      name,
      type,
      value
    }
  }
}

function readConfirmation(record, msg) {
  return new Promise(resolve => {
    const time = chalk.gray(
      ms(new Date() - new Date(Number(record.created))) + ' ago'
    )
    const tbl = table(
      [
        [
          record.id,
          chalk.bold(
            `${record.name.length > 0
              ? record.name + '.'
              : ''}${record.domain} ${record.type} ${record.value} ${record.mxPriority
              ? record.mxPriority
              : ''}`
          ),
          time
        ]
      ],
      { align: ['l', 'r', 'l'], hsep: ' '.repeat(6) }
    )

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
