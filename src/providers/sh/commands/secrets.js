#!/usr/bin/env node

// Packages
const chalk = require('chalk')
const table = require('text-table')
const minimist = require('minimist')
const ms = require('ms')

// Utilities
const strlen = require('../util/strlen')
const { handleError, error } = require('../util/error')
const NowSecrets = require('../util/secrets')
const exit = require('../util/etc/exit')
const logo = require('../util/etc/output/logo')
const getWelcome = require('../../../get-welcome')
const providers = require('../../')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now secrets`)} <ls | add | rename | rm> <secret>

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -b, --base64            Treat value as base64-encoded
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline(
    'FILE'
  )}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )} Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Lists all your secrets:

    ${chalk.cyan('$ now secrets ls')}

  ${chalk.gray('–')} Adds a new secret:

    ${chalk.cyan('$ now secrets add my-secret "my value"')}

    ${chalk.gray(
      '–'
    )} Once added, a secret's value can't be retrieved in plaintext anymore
    ${chalk.gray(
      '–'
    )} If the secret's value is more than one word, wrap it in quotes
    ${chalk.gray('–')} Actually, when in doubt, wrap your value in quotes

  ${chalk.gray('–')} Exposes a secret as an env variable:

    ${chalk.cyan(`$ now -e MY_SECRET=${chalk.bold('@my-secret')}`)}

    Notice the ${chalk.cyan.bold(
      '`@`'
    )} symbol which makes the value a secret reference.

  ${chalk.gray('–')} Renames a secret:

    ${chalk.cyan(`$ now secrets rename my-secret my-renamed-secret`)}

  ${chalk.gray('–')} Removes a secret:

    ${chalk.cyan(`$ now secrets rm my-secret`)}
`)
}

// Options
let argv
let debug
let apiUrl
let subcommand

const main = async ctx => {
  argv = minimist(ctx.argv.slice(2), {
    string: ['token'],
    boolean: ['help', 'debug', 'base64'],
    alias: {
      help: 'h',
      debug: 'd',
      base64: 'b',
      token: 't'
    }
  })

  if (!ctx.authConfig.credentials.length) {
    console.log(getWelcome('sh', providers))
    return 0
  }

  argv._ = argv._.slice(1)

  debug = argv.debug
  apiUrl = argv.url || 'https://api.zeit.co'
  subcommand = argv._[0]

  if (argv.help || !subcommand) {
    help()
    exit(0)
  }

  const {authConfig: { credentials }, config: { sh }} = ctx
  const {token} = argv.token || credentials.find(item => item.provider === 'sh')

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
  const secrets = new NowSecrets({ apiUrl, token, debug, currentTeam })
  const args = argv._.slice(1)
  const start = Date.now()

  if (subcommand === 'ls' || subcommand === 'list') {
    if (args.length !== 0) {
      error(
        `Invalid number of arguments. Usage: ${chalk.cyan('`now secret ls`')}`
      )
      return exit(1)
    }

    const list = await secrets.ls()
    const elapsed = ms(new Date() - start)

    console.log(
      `> ${list.length} secret${list.length === 1
        ? ''
        : 's'} found under ${chalk.bold(
        (currentTeam && currentTeam.slug) || user.username || user.email
      )} ${chalk.gray(`[${elapsed}]`)}`
    )

    if (list.length > 0) {
      const cur = Date.now()
      const header = [['', 'name', 'created'].map(s => chalk.dim(s))]
      const out = table(
        header.concat(
          list.map(secret => {
            return [
              '',
              chalk.bold(secret.name),
              chalk.gray(ms(cur - new Date(secret.created)) + ' ago')
            ]
          })
        ),
        {
          align: ['l', 'l', 'l'],
          hsep: ' '.repeat(2),
          stringLength: strlen
        }
      )

      if (out) {
        console.log('\n' + out + '\n')
      }
    }
    return secrets.close()
  }

  if (subcommand === 'rm' || subcommand === 'remove') {
    if (args.length !== 1) {
      error(
        `Invalid number of arguments. Usage: ${chalk.cyan(
          '`now secret rm <name>`'
        )}`
      )
      return exit(1)
    }
    const list = await secrets.ls()
    const theSecret = list.find(secret => secret.name === args[0])

    if (theSecret) {
      const yes = await readConfirmation(theSecret)
      if (!yes) {
        error('User abort')
        return exit(0)
      }
    } else {
      error(`No secret found by name "${args[0]}"`)
      return exit(1)
    }

    const secret = await secrets.rm(args[0])
    const elapsed = ms(new Date() - start)
    console.log(
      `${chalk.cyan('> Success!')} Secret ${chalk.bold(
        secret.name
      )} removed ${chalk.gray(`[${elapsed}]`)}`
    )
    return secrets.close()
  }

  if (subcommand === 'rename') {
    if (args.length !== 2) {
      error(
        `Invalid number of arguments. Usage: ${chalk.cyan(
          '`now secret rename <old-name> <new-name>`'
        )}`
      )
      return exit(1)
    }
    const secret = await secrets.rename(args[0], args[1])
    const elapsed = ms(new Date() - start)
    console.log(
      `${chalk.cyan('> Success!')} Secret ${chalk.bold(
        secret.oldName
      )} renamed to ${chalk.bold(args[1])} ${chalk.gray(`[${elapsed}]`)}`
    )
    return secrets.close()
  }

  if (subcommand === 'add' || subcommand === 'set') {
    if (args.length !== 2) {
      error(
        `Invalid number of arguments. Usage: ${chalk.cyan(
          '`now secret add <name> <value>`'
        )}`
      )

      if (args.length > 2) {
        const example = chalk.cyan(`$ now secret add ${args[0]}`)
        console.log(
          `> If your secret has spaces, make sure to wrap it in quotes. Example: \n  ${example} `
        )
      }

      return exit(1)
    }

    const [name, value_] = args
    let value

    if (argv.base64) {
      value = { base64: value_ }
    } else {
      value = value_
    }

    await secrets.add(name, value)
    const elapsed = ms(new Date() - start)

    console.log(
      `${chalk.cyan('> Success!')} Secret ${chalk.bold(
        name.toLowerCase()
      )} added (${chalk.bold(
        (currentTeam && currentTeam.slug) || user.username || user.email
      )}) ${chalk.gray(`[${elapsed}]`)}`
    )
    return secrets.close()
  }

  error('Please specify a valid subcommand: ls | add | rename | rm')
  help()
  exit(1)
}

process.on('uncaughtException', err => {
  handleError(err)
  exit(1)
})

function readConfirmation(secret) {
  return new Promise(resolve => {
    const time = chalk.gray(ms(new Date() - new Date(secret.created)) + ' ago')
    const tbl = table([[chalk.bold(secret.name), time]], {
      align: ['r', 'l'],
      hsep: ' '.repeat(6)
    })

    process.stdout.write('> The following secret will be removed permanently\n')
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
