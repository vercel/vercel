#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const mri = require('mri')
const ms = require('ms')
const psl = require('psl')
const table = require('text-table')
const plural = require('pluralize')

// Utilities
const NowDomains = require('../util/domains')
const exit = require('../../../util/exit')
const logo = require('../../../util/output/logo')
const promptBool = require('../../../util/input/prompt-bool')
const strlen = require('../util/strlen')
const toHost = require('../util/to-host')
const { handleError, error } = require('../util/error')
const buy = require('./domains/buy')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now domains`)} [options] <command>

  ${chalk.dim('Commands:')}

    ls             Show all domains in a list
    add   [name]   Add a new domain that you already own
    rm    [name]   Remove a domain
    buy   [name]   Buy a domain that you don't yet own

  ${chalk.dim('Options:')}

    -h, --help                     Output usage information
    -d, --debug                    Debug mode [off]
    -e, --external                 Use external DNS server
    -f, --force                    Skip DNS verification
    -A ${chalk.bold.underline('FILE')}, --local-config=${chalk.bold.underline(
    'FILE'
  )}   Path to the local ${'`now.json`'} file
    -Q ${chalk.bold.underline('DIR')}, --global-config=${chalk.bold.underline(
    'DIR'
  )}    Path to the global ${'`.now`'} directory
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )}        Login token
    -T, --team                     Set a custom team scope

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Add a domain that you already own

      ${chalk.cyan(`$ now domains add ${chalk.underline('domain-name.com')}`)}

      Make sure the domain's DNS nameservers are at least 2 of the
      ones listed on ${chalk.underline('https://zeit.world')}.

      ${chalk.yellow('NOTE:')} Running ${chalk.dim(
    '`now alias`'
  )} will automatically register your domain
      if it's configured with these nameservers (no need to ${chalk.dim(
        '`domain add`'
      )}).

  ${chalk.gray(
    '–'
  )} Add a domain using an external nameserver

      ${chalk.cyan('$ now domain add -e my-app.com')}
`)
}

// Options
let argv
let debug
let apiUrl
let subcommand

const main = async ctx => {
  argv = mri(ctx.argv.slice(2), {
    string: ['coupon'],
    boolean: ['help', 'debug', 'external', 'force'],
    alias: {
      help: 'h',
      coupon: 'c',
      debug: 'd',
      external: 'e',
      force: 'f'
    }
  })

  argv._ = argv._.slice(1)

  debug = argv.debug
  apiUrl = ctx.apiUrl
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
  const domain = new NowDomains({ apiUrl, token, debug, currentTeam })
  const args = argv._.slice(1)

  switch (subcommand) {
    case 'ls':
    case 'list': {
      if (args.length !== 0) {
        console.error(error('Invalid number of arguments'))
        return exit(1)
      }

      const start_ = new Date()
      const domains = await domain.ls()
      domains.sort((a, b) => new Date(b.created) - new Date(a.created))
      const current = new Date()
      const header = [
        ['', 'domain', 'dns', 'verified', 'created'].map(s => chalk.dim(s))
      ]
      const out =
        domains.length === 0
          ? null
          : table(
              header.concat(
                domains.map(domain => {
                  const ns = domain.isExternal ? 'external' : 'zeit.world'
                  const url = chalk.bold(domain.name)
                  const time = chalk.gray(
                    ms(current - new Date(domain.created)) + ' ago'
                  )
                  return ['', url, ns, domain.verified, time]
                })
              ),
              {
                align: ['l', 'l', 'l', 'l', 'l'],
                hsep: ' '.repeat(2),
                stringLength: strlen
              }
            )

      const elapsed_ = ms(new Date() - start_)
      console.log(
        `> ${plural('domain', domains.length, true)} found under ${chalk.bold(
          (currentTeam && currentTeam.slug) || user.username || user.email
        )} ${chalk.gray(`[${elapsed_}]`)}`
      )

      if (out) {
        console.log('\n' + out + '\n')
      }

      break
    }
    case 'rm':
    case 'remove': {
      if (args.length !== 1) {
        console.error(error('Invalid number of arguments'))
        return exit(1)
      }

      const _target = String(args[0])
      if (!_target) {
        const err = new Error('No domain specified')
        err.userError = true
        throw err
      }

      const _domains = await domain.ls()
      const _domain = findDomain(_target, _domains)

      if (!_domain) {
        const err = new Error(
          `Domain not found by "${_target}". Run ${chalk.dim(
            '`now domains ls`'
          )} to see your domains.`
        )
        err.userError = true
        throw err
      }

      try {
        const confirmation = (await readConfirmation(
          domain,
          _domain
        )).toLowerCase()
        if (confirmation !== 'y' && confirmation !== 'yes') {
          console.log('\n> Aborted')
          process.exit(0)
        }

        const start = new Date()
        await domain.rm(_domain)
        const elapsed = ms(new Date() - start)
        console.log(
          `${chalk.cyan('> Success!')} Domain ${chalk.bold(_domain.name)} removed [${elapsed}]`
        )
      } catch (err) {
        console.error(error(err))
        exit(1)
      }
      break
    }
    case 'add':
    case 'set': {
      if (args.length !== 1) {
        console.error(error('Invalid number of arguments'))
        return exit(1)
      }
      const name = String(args[0])

      if (!await promptBool(`Are you sure you want to add "${name}"?`)) {
        return exit(1)
      }

      const parsedDomain = psl.parse(name)
      if (parsedDomain.subdomain) {
        const msg =
          `You are adding "${name}" as a domain name which seems to contain a subdomain part "${parsedDomain.subdomain}".\n` +
          '  This is probably wrong unless you really know what you are doing.\n' +
          `  To add the root domain instead please run: ${chalk.cyan(
            'now domain add ' +
              (argv.external ? '-e ' : '') +
              parsedDomain.domain
          )}\n` +
          `  Continue adding "${name}" as a domain name?`
        if (!await promptBool(msg)) {
          return exit(1)
        }
      }

      const start = new Date()
      const { uid, code, created, verified } = await domain.add(
        name,
        argv.force,
        argv.external
      )
      const elapsed = ms(new Date() - start)
      if (created) {
        console.log(
          `${chalk.cyan('> Success!')} Domain ${chalk.bold(
            chalk.underline(name)
          )} ${chalk.dim(`(${uid})`)} added [${elapsed}]`
        )
      } else if (verified) {
        console.log(
          `${chalk.cyan('> Success!')} Domain ${chalk.bold(
            chalk.underline(name)
          )} ${chalk.dim(`(${uid})`)} verified [${elapsed}]`
        )
      } else if (code === 'not_modified') {
        console.log(
          `${chalk.cyan('> Success!')} Domain ${chalk.bold(
            chalk.underline(name)
          )} ${chalk.dim(`(${uid})`)} already exists [${elapsed}]`
        )
      } else {
        console.log(
          '> Verification required: Please rerun this command after some time'
        )
      }
      break
    }
    case 'buy': {
      await buy({
        domains: domain,
        args,
        currentTeam,
        user,
        coupon: argv.coupon
      })
      break
    }
    default:
      console.error(error('Please specify a valid subcommand: ls | add | rm'))
      help()
      exit(1)
  }

  domain.close()
}

async function readConfirmation(domain, _domain) {
  return new Promise(resolve => {
    const time = chalk.gray(ms(new Date() - new Date(_domain.created)) + ' ago')
    const tbl = table([[chalk.bold(_domain.name), time]], {
      align: ['r', 'l'],
      hsep: ' '.repeat(6)
    })

    process.stdout.write('> The following domain will be removed permanently\n')
    process.stdout.write('  ' + tbl + '\n')

    if (_domain.aliases.length > 0) {
      process.stdout.write(
        `> ${chalk.yellow('Warning!')} This domain's ` +
          `${chalk.bold(
            plural('alias', _domain.aliases.length, true)
          )} ` +
          `will be removed. Run ${chalk.dim('`now alias ls`')} to list them.\n`
      )
    }
    if (_domain.certs.length > 0) {
      process.stdout.write(
        `> ${chalk.yellow('Warning!')} This domain's ` +
          `${chalk.bold(
            plural('certificate', _domain.certs.length, true)
          )} ` +
          `will be removed. Run ${chalk.dim('`now cert ls`')} to list them.\n`
      )
    }

    process.stdout.write(
      `${chalk.bold.red('> Are you sure?')} ${chalk.gray('[y/N] ')}`
    )

    process.stdin
      .on('data', d => {
        process.stdin.pause()
        resolve(d.toString().trim())
      })
      .resume()
  })
}

function findDomain(val, list) {
  return list.find(d => {
    if (d.uid === val) {
      if (debug) {
        console.log(`> [debug] matched domain ${d.uid} by uid`)
      }

      return true
    }

    // Match prefix
    if (d.name === toHost(val)) {
      if (debug) {
        console.log(`> [debug] matched domain ${d.uid} by name ${d.name}`)
      }

      return true
    }

    return false
  })
}
