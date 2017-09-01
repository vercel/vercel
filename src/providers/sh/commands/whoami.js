#!/usr/bin/env node

// Packages
const minimist = require('minimist')
const chalk = require('chalk')

// Utilities
const logo = require('../util/etc/output/logo')
const { handleError } = require('../util/error')
const getWelcome = require('../../../get-welcome')
const providers = require('../../')

const help = () => {
  console.log(`
  ${chalk.bold(`${logo} now whoami`)}

  ${chalk.dim('Options:')}

    -h, --help              Output usage information
    -c ${chalk.bold.underline('FILE')}, --config=${chalk.bold.underline(
    'FILE'
  )}  Config file
    -d, --debug             Debug mode [off]
    -t ${chalk.bold.underline('TOKEN')}, --token=${chalk.bold.underline(
    'TOKEN'
  )} Login token

  ${chalk.dim('Examples:')}

  ${chalk.gray('–')} Show the current team context

    ${chalk.cyan('$ now whoami')}
`)
}

// Options
let argv

const main = async ctx => {
  argv = minimist(ctx.argv.slice(2), {
    string: ['token'],
    boolean: ['help', 'debug', 'all'],
    alias: {
      help: 'h',
      debug: 'd',
      token: 't'
    }
  })

  if (!ctx.authConfig.credentials.length) {
    console.log(getWelcome('sh', providers))
    return 0
  }

  if (argv.help) {
    help()
    process.exit(0)
  }

  await whoami(ctx.config.sh)
}

module.exports = async ctx => {
  try {
    await main(ctx)
  } catch (err) {
    handleError(err)
    process.exit(1)
  }
}

async function whoami({user}) {
  if (process.stdout.isTTY) {
    process.stdout.write('> ')
  }

  const name = user.username || user.email
  console.log(name)
}
